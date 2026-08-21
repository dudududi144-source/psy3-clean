

/* ---------- Groovebox engine ---------- */
function Groovebox(){
  this.ctx=null;
  this.master=null; this.autoFilter=null; this.djFilter=null;
  this.drivePre=null; this.shaper=null; this.drivePost=null;
  this.comp=null; this.analyser=null;
  this.delayIn=null; this.dL=null; this.dR=null; this.reverbIn=null;
  this.partGains={}; this.duck=null;
  this.noiseBuf=null; this.voices=null;
  this.pendingSeekBar=null;
  this.recorder=null; this.recChunks=[]; this.recStarted=0; // Phase 4: live recording state
  this.suppressMidi=false; // Phase 4: true on offline export clones (no MIDI leakage)
  this.brainMode="MANUAL"; // Phase 3: MANUAL / GENERATIVE / ADAPTIVE
  this.isPlaying=false; this.absStep=0; this.nextNoteTime=0; this.timerId=null;
  this.uiQueue=[];
  this.bpm=145; this.swing=0; // Phase 2: psytrance is straight; swing available via knob
  this.seed=1337; this.variation=1;
  this.patterns=makePatterns(this.seed);
  // Phase 2 takeover flags: BASS/LEAD are arrangement-driven until the user
  // edits their pattern rows; first edit switches them to pattern-driven.
  this.patternEdited={bass:false,lead:false};
  this.chance={PERC:new Array(16).fill(1),ARP:new Array(16).fill(1)}; // Session 34: per-step play chance per part (1=always)
  this.partLen={KICK:16,BASS:16,PERC:16,LEAD:16,ARP:16,PAD:16}; // Session 28: per-part loop length (polyrhythm)
  this.sectionPatterns={}; // Phase 2 BarPlan: per-section overrides (lazy ownership via activePatterns)
  this.song=buildSong(this.seed);
  this._barCacheKey=-1;
  this._lastSecIdx=-1;
  this.arr={secIdx:0,barInSec:0,cycle:0};
  this._lastCycle=0;
  this.mutes={KICK:0,BASS:0,PERC:0,LEAD:0,ARP:0,PAD:0};
  this.knobVals={bpm:(145-120)/45,filter:1,res:0.15,drive:0.15,delay:0.35,reverb:0.30,swing:0,duck:0.75};
  this.filterMode="LP"; // Phase 2: DJ filter mode (LP default = legacy behavior)
  this.duckDepth=0.40; // Phase 2: sidechain depth (DUCK knob; 0.40 = legacy default)
  this.genre="FULL-ON"; // Phase 2: sound preset (FULL-ON / DARK-PSY / PROGRESSIVE)
  this.lastLeadMidi=null;
  this._timeBuf=new Uint8Array(512);
}
/* ═══ GENRE SOUND CONFIG ═══ */
var GENRE_SOUND_CONFIG={
  "FULL-ON":{
    bassWave:"sawtooth", bassCut:1200, bassRes:8, bassLvl:0.9,
    leadCut:8000, leadRes:5, leadLvl:0.7,
    arpCut:10000, arpRes:3, arpLvl:0.6,
    padLvl:0.5, padCut:12000,
    kickStart:150, kickEnd:55, kickDecay:0.10, kickPunch:0.35,
    hatFreq:8000, hatDecay:0.04,
    percTune:1.0, percDecay:0.08
  },
  "DARK-PSY":{
    bassWave:"sawtooth", bassCut:800, bassRes:12, bassLvl:0.95,
    leadCut:6000, leadRes:8, leadLvl:0.6,
    arpCut:8000, arpRes:5, arpLvl:0.5,
    padLvl:0.4, padCut:10000,
    kickStart:120, kickEnd:45, kickDecay:0.12, kickPunch:0.4,
    hatFreq:7000, hatDecay:0.05,
    percTune:0.8, percDecay:0.10
  },
  "PROGRESSIVE":{
    bassWave:"triangle", bassCut:1500, bassRes:5, bassLvl:0.85,
    leadCut:10000, leadRes:3, leadLvl:0.7,
    arpCut:12000, arpRes:2, arpLvl:0.65,
    padLvl:0.6, padCut:14000,
    kickStart:180, kickEnd:60, kickDecay:0.08, kickPunch:0.3,
    hatFreq:9000, hatDecay:0.03,
    percTune:1.2, percDecay:0.06
  }
};

Groovebox.prototype.setGenre=function(name){
  // Phase 2: genre presets become reachable. Voices read config live via the
  // getCfg thunk, so the switch applies from the next note onward.
  if(!GENRE_SOUND_CONFIG[name]) return;
  this.genre=name;
  STYLE.name=name;
  if(typeof updateLcd==="function") updateLcd();
  if(typeof setStatus==="function") setStatus("GENRE: "+name,"ok");
  if(typeof trackEvent==="function") trackEvent("genre_set",{name:name});
};
Groovebox.prototype.cycleGenre=function(){
  var names=["FULL-ON","DARK-PSY","PROGRESSIVE"];
  var cur=names.indexOf(this.genre||"FULL-ON");
  this.setGenre(names[(cur+1)%names.length]);
};
Groovebox.prototype.patternsFor=function(sectionName){
  // Phase 2 BarPlan: sections that were edited own their pattern set;
  // unedited sections fall back to the global (seeded) patterns.
  return (this.sectionPatterns&&this.sectionPatterns[sectionName])||this.patterns;
};
Groovebox.prototype.activePatterns=function(){
  // Grid-edit target: the pattern set of the section at the playhead.
  // First edit on a section clones the global baseline (lazy ownership).
  var info=sectionAt(this.song,Math.floor(this.absStep/16));
  var name=info.section.name;
  if(!this.sectionPatterns) this.sectionPatterns={};
  if(!this.sectionPatterns[name]) this.sectionPatterns[name]=JSON.parse(JSON.stringify(this.patterns));
  return this.sectionPatterns[name];
};
Groovebox.prototype.cfg=function(){
  // Phase 2: genre presets reachable via device.setGenre()/cycleGenre().
  var gs=(this.genre&&GENRE_SOUND_CONFIG[this.genre])||window._genreSound||GENRE_SOUND_CONFIG["FULL-ON"];
  return {
    bassWave:gs.bassWave, bassCut:gs.bassCut, bassRes:gs.bassRes, bassLvl:gs.bassLvl,
    leadCut:gs.leadCut, leadRes:gs.leadRes, leadLvl:gs.leadLvl,
    arpCut:gs.arpCut, arpRes:gs.arpRes, arpLvl:gs.arpLvl,
    padLvl:gs.padLvl, padCut:gs.padCut,
    kickStart:gs.kickStart||150, kickEnd:gs.kickEnd||55, kickDecay:gs.kickDecay||.10, kickPunch:gs.kickPunch||.35,
    hatFreq:gs.hatFreq||8000, hatDecay:gs.hatDecay||.04,
    percTune:gs.percTune||1.0, percDecay:gs.percDecay||.08 // Phase 2: corrected fallback (FULL-ON value; was .4)
  };
};
Groovebox.prototype.stepDur=function(){ return 60/this.bpm/4; };


/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mapRange(value, inMin, inMax, outMin, outMax) {
  return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
}

var PART_COLORS={
  KICK:"#ff2e88",
  BASS:"#ff8a3c",
  PERC:"#ffd166",
  LEAD:"#06d6a0",
  ARP:"#118ab2",
  PAD:"#a8e6cf"
};

var PART_NAMES=["KICK","BASS","PERC","LEAD","ARP","PAD"];

// Phase 2 cleanup: PooledEngine removed (banner + object). It was initialized
// (44 always-on silent voices on master) but never triggered - pure DSP waste.
// The live engine is per-note allocation; pooling revisited only if node-churn
// dropouts are ever measured.
