



/* ============================================================
   GRAMMAR SYSTEM (Phase B1)
   Inspired by PSY6-ULTIMATE — Statistical Learning
   ============================================================ */

var Grammars = {
  bass: {
    transitions: [],
    totalObservations: 0,
    init: function() {
      this.transitions = [];
      for (var i = 0; i < 12; i++) {
        this.transitions[i] = [];
        for (var j = 0; j < 12; j++) {
          this.transitions[i][j] = 1;
        }
      }
      this.totalObservations = 0;
    },
    observe: function(fromInterval, toInterval) {
      var from = ((fromInterval % 12) + 12) % 12;
      var to = ((toInterval % 12) + 12) % 12;
      this.transitions[from][to]++;
      this.totalObservations++;
    },
    generate: function(currentInterval, rng) {
      var from = ((currentInterval % 12) + 12) % 12;
      var row = this.transitions[from];
      var total = 0;
      for (var i = 0; i < 12; i++) total += row[i];
      var r = (rng ? rng() : Math.random()) * total;
      var cumulative = 0;
      for (var i = 0; i < 12; i++) {
        cumulative += row[i];
        if (r <= cumulative) return i;
      }
      return 0;
    },
    confidence: function() {
      return Math.min(100, Math.floor(this.totalObservations / 50 * 100));
    }
  },
  melodic: {
    intervals: [],
    contourUp: 0,
    contourDown: 0,
    contourSame: 0,
    totalObservations: 0,
    init: function() {
      this.intervals = [];
      for (var i = 0; i < 25; i++) {
        this.intervals[i] = 1;
      }
      this.contourUp = 0;
      this.contourDown = 0;
      this.contourSame = 0;
      this.totalObservations = 0;
    },
    observe: function(interval) {
      var idx = Math.max(0, Math.min(24, interval + 12));
      this.intervals[idx]++;
      if (interval > 0) this.contourUp++;
      else if (interval < 0) this.contourDown++;
      else this.contourSame++;
      this.totalObservations++;
    },
    generate: function(rng) {
      var total = 0;
      for (var i = 0; i < 25; i++) total += this.intervals[i];
      var r = (rng ? rng() : Math.random()) * total;
      var cumulative = 0;
      for (var i = 0; i < 25; i++) {
        cumulative += this.intervals[i];
        if (r <= cumulative) return i - 12;
      }
      return 0;
    },
    contourTendency: function() {
      var total = this.contourUp + this.contourDown + this.contourSame;
      if (total === 0) return 'neutral';
      if (this.contourUp > this.contourDown && this.contourUp > this.contourSame) return 'up';
      if (this.contourDown > this.contourUp && this.contourDown > this.contourSame) return 'down';
      return 'same';
    },
    confidence: function() {
      return Math.min(100, Math.floor(this.totalObservations / 50 * 100));
    }
  },
  rhythm: {
    steps: [],
    totalObservations: 0,
    init: function() {
      this.steps = [];
      for (var i = 0; i < 16; i++) {
        this.steps[i] = 1;
      }
      this.totalObservations = 0;
    },
    observe: function(step) {
      var s = ((step % 16) + 16) % 16;
      this.steps[s]++;
      this.totalObservations++;
    },
    generate: function(rng) {
      var pattern = [];
      for (var i = 0; i < 16; i++) {
        var probability = this.steps[i] / (this.totalObservations + 16);
        pattern[i] = (rng ? rng() : Math.random()) < probability * 2 ? 1 : 0;
      }
      return pattern;
    },
    confidence: function() {
      return Math.min(100, Math.floor(this.totalObservations / 50 * 100));
    }
  },
  init: function() {
    this.bass.init();
    this.melodic.init();
    this.rhythm.init();
    console.log('Grammars initialized');
  }
};

/* ============================================================
   GRAMMAR INTEGRATION (Connect grammars to performance)
   ============================================================ */

// Track last played note for grammar learning
var grammarTracker = {
  lastBassNote: null,
  lastMelodyNote: null,
  lastKickStep: null,
  
  // Call this when a bass note is played
  trackBass: function(note) {
    if (this.lastBassNote !== null) {
      var interval = note - this.lastBassNote;
      Grammars.bass.observe(interval, 0);
    }
    this.lastBassNote = note;
  },
  
  // Call this when a melody note is played
  trackMelody: function(note) {
    if (this.lastMelodyNote !== null) {
      var interval = note - this.lastMelodyNote;
      Grammars.melodic.observe(interval);
    }
    this.lastMelodyNote = note;
  },
  
  // Call this when a kick is triggered
  trackKick: function(step) {
    Grammars.rhythm.observe(step);
    this.lastKickStep = step;
  }
};

// Hook into hitPad to track performance
var originalHitPad = null;

// Hook into scheduleStep to track kick and generate
var originalScheduleStep = null;

// Phase 3: the missing learning hook. scheduleStep has called this since the
// PSY6 copy but it was never defined, so all grammars stayed frozen on priors.
function updateGrammars(kind,step,value){
  if(typeof grammarTracker==="undefined") return;
  if(kind==="kick"){ grammarTracker.trackKick(step); }
  else if(kind==="bass"){ grammarTracker.trackBass(value); }
  else if(kind==="lead"||kind==="melody"){ grammarTracker.trackMelody(value); }
}

// Initialize brain mode
var brainMode = 'MANUAL'; // MANUAL, GENERATIVE, ADAPTIVE

function setBrainMode(mode) {
  brainMode = mode;
  if (device) {
    device.brainMode = mode;
  }
  var statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = 'BRAIN: ' + mode;
    statusEl.className = 'ok';
  }
  trackEvent('brain_mode', { mode: mode });
}


/* ============================================================
   CANDIDATE GENERATOR (Phase B2)
   Inspired by PSY6-ULTIMATE — 5 candidates/bar
   ============================================================ */

var CandidateGenerator = {
  candidatesPerBar: 5,
  generateCandidates: function(currentState, rng) {
    var candidates = [];
    for (var i = 0; i < this.candidatesPerBar; i++) {
      candidates.push(this.generateCandidate(currentState, rng));
    }
    return candidates;
  },
  generateCandidate: function(currentState, rng) {
    var candidate = {
      bassNotes: [],
      melodyNotes: [],
      rhythmPattern: [],
      score: 0
    };
    var currentInterval = currentState.lastBassInterval || 0;
    for (var i = 0; i < 4; i++) {
      var nextInterval = Grammars.bass.generate(currentInterval, rng);
      candidate.bassNotes.push(nextInterval);
      currentInterval = nextInterval;
    }
    for (var i = 0; i < 8; i++) {
      var interval = Grammars.melodic.generate(rng);
      candidate.melodyNotes.push(interval);
    }
    candidate.rhythmPattern = Grammars.rhythm.generate(rng);
    candidate.score = this.scoreCandidate(candidate, currentState);
    return candidate;
  },
  scoreCandidate: function(candidate, currentState) {
    // Phase 3: candidate-dependent fitness. The old version scored ~80% from
    // global grammar stats (identical for every candidate) and rewarded raw
    // density - selection was effectively "pick the busiest pattern".
    var score = 0;
    var q, rowSum, total;
    // (1) Bass: likelihood of the candidate's interval path under the learned grammar.
    var iv = (currentState && currentState.lastBassInterval) || 0;
    for (var b = 0; b < candidate.bassNotes.length; b++) {
      var from = ((iv % 12) + 12) % 12;
      var to = ((candidate.bassNotes[b] % 12) + 12) % 12;
      var row = Grammars.bass.transitions[from];
      rowSum = 0;
      for (q = 0; q < 12; q++) rowSum += row[q];
      score += (row[to] / rowSum) * 6;
      iv = candidate.bassNotes[b];
    }
    // (2) Melody: likelihood of each candidate interval under the learned grammar.
    total = 0;
    for (q = 0; q < 25; q++) total += Grammars.melodic.intervals[q];
    for (var m = 0; m < candidate.melodyNotes.length; m++) {
      var idx = Math.max(0, Math.min(24, candidate.melodyNotes[m] + 12));
      score += (Grammars.melodic.intervals[idx] / total) * 4;
    }
    // (3) Rhythm: target ~50% density; penalize walls of sound and near-empty bars.
    var on = 0;
    for (var r = 0; r < candidate.rhythmPattern.length; r++) if (candidate.rhythmPattern[r]) on++;
    var density = on / candidate.rhythmPattern.length;
    score += 8 - Math.abs(density - 0.5) * 20;
    // (4) Reward four-on-the-floor anchors.
    for (var k = 0; k < candidate.rhythmPattern.length; k += 4) if (candidate.rhythmPattern[k]) score += 1.5;
    // (5) Small contour-alignment bonus (kept, de-weighted).
    var contour = Grammars.melodic.contourTendency();
    if (contour === 'up' || contour === 'down') score += 2;
    return score;
  },
  selectBest: function(candidates) {
    var best = candidates[0];
    for (var i = 1; i < candidates.length; i++) {
      if (candidates[i].score > best.score) best = candidates[i];
    }
    return best;
  },
  generateNextBar: function(currentState, rng) {
    var candidates = this.generateCandidates(currentState, rng);
    return this.selectBest(candidates);
  }
};



// Session 21 cleanup: TrackControl removed. It was never initialized, and its
// init() would double-route every partGain (~+6dB and bypassing the BASS/PAD
// duck bus). Mutes live in device.mutes + applySongSection; per-track
// volume/pan/sends must be rebuilt on the live routing if ever wanted.

// Phase 2 cleanup: initSoftClipOutput() / initBrickwallLimiter() removed.
// Both were never called. The limiter is wired directly in Groovebox.init()
// (session 10); the drive stage already uses its own WaveShaper.
// Session 21 cleanup: PolyBLEPOscillator removed (zero callers; a createOscillator stub).






/* ============================================================
   CHORD PROGRESSION ENGINE (from PSY6-ULTIMATE)
   7 progressions for different moods
   ============================================================ */

var ChordEngine = {
  progressions: [
    { name: 'Epic/Trance', degrees: [0, 5, 2, 6] },      // i-VI-III-VII
    { name: 'Minor Classic', degrees: [0, 3, 4, 0] },     // i-iv-v-i
    { name: 'Major Classic', degrees: [0, 3, 4, 0] },     // I-IV-V-I
    { name: 'Andalusian', degrees: [0, 6, 5, 4] },        // i-VII-VI-V
    { name: 'Melodic', degrees: [0, 2, 6, 5] },           // i-III-VII-VI
    { name: 'Psy Hypnotic', degrees: [0, 4, 3, 4] },      // i-v-iv-v
    { name: 'Pop/Prog', degrees: [0, 4, 5, 3] }           // I-V-vi-IV
  ],
  
  currentProgression: 0,
  currentChord: 0,
  root: 33, // A1 in MIDI
  
  setProgression: function(index) {
    this.currentProgression = index % this.progressions.length;
    this.currentChord = 0;
    var statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.textContent = 'CHORD: ' + this.progressions[this.currentProgression].name;
      statusEl.className = 'ok';
    }
  },
  
  nextChord: function() {
    this.currentChord = (this.currentChord + 1) % 4;
    return this.getCurrentChord();
  },
  
  getCurrentChord: function() {
    var prog = this.progressions[this.currentProgression];
    var degree = prog.degrees[this.currentChord];
    
    // Scale degrees to semitones (minor scale)
    var scaleDegrees = [0, 2, 3, 5, 7, 8, 10];
    var semitone = scaleDegrees[degree % 7];
    
    return {
      root: this.root + semitone,
      third: this.root + semitone + 3,  // Minor third
      fifth: this.root + semitone + 7,  // Perfect fifth
      name: prog.name
    };
  },
  
  // Generate chord-aware arpeggio
  generateArpeggio: function(mode) {
    var chord = this.getCurrentChord();
    var notes = [chord.root, chord.third, chord.fifth, chord.root + 12];
    
    if (mode === 'up') return notes;
    if (mode === 'down') return notes.reverse();
    if (mode === 'updown') return notes.concat(notes.slice(1, -1).reverse());
    if (mode === 'random') {
      // Shuffle
      for (var i = notes.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = notes[i];
        notes[i] = notes[j];
        notes[j] = temp;
      }
      return notes;
    }
    return notes;
  }
};

// Phase 2 cleanup: POOLED ENGINE INTEGRATION removed (triggerDrumWithPool,
// triggerSynthWithPool, panicAllVoices, initPooledEngine). Verified zero callers;
// the live engine allocates per-note. PooledEngine object removed from groovebox.js.



Groovebox.prototype.init=function(extCtx){
  // Phase 4: extCtx = OfflineAudioContext for WAV export (disposable instance).
  if(this.ctx){
    if(this.ctx.state==="suspended"&&this.ctx.resume) return this.ctx.resume();
    return Promise.resolve();
  }
  var ctx=extCtx;
  if(!ctx){
    var AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return Promise.reject(new Error("Web Audio API not supported"));
    ctx=new AC();
  }
  var self=this;
  this.ctx=ctx;
  this.master=ctx.createGain(); this.master.gain.value=0.9;
  this.autoFilter=ctx.createBiquadFilter(); this.autoFilter.type="lowpass";
  this.autoFilter.Q.value=0.8; this.autoFilter.frequency.value=16000;
  this.djFilter=ctx.createBiquadFilter(); this.djFilter.type="lowpass";
  this.djFilter.Q.value=0.7; this.djFilter.frequency.value=18500;
  this.drivePre=ctx.createGain(); this.drivePre.gain.value=1;
  this.shaper=ctx.createWaveShaper();
  this.drivePost=ctx.createGain(); this.drivePost.gain.value=1;
  this.comp=ctx.createDynamicsCompressor();
  this.comp.threshold.value=-14; this.comp.knee.value=10; this.comp.ratio.value=5;
  this.comp.attack.value=0.004; this.comp.release.value=0.16;
  this.analyser=ctx.createAnalyser(); this.analyser.fftSize=512; this.analyser.smoothingTimeConstant=0.7;
  this.master.connect(this.autoFilter);
  this.autoFilter.connect(this.djFilter);
  this.djFilter.connect(this.drivePre);
  this.drivePre.connect(this.shaper);
  this.shaper.connect(this.drivePost);
  this.drivePost.connect(this.comp);
  // Phase 2: brickwall limiter (-1dB, 20:1, hard knee) after the glue comp.
  // Analyser stays LAST, so meters/selfTest measure the final output.
  if(!extCtx&&typeof BrickwallLimiter!=="undefined"&&BrickwallLimiter.init){ // live only: limiter singleton is ctx-bound
    this.comp.connect(BrickwallLimiter.init(ctx,this.analyser));
  }else{
    this.comp.connect(this.analyser);
  }
  this.analyser.connect(ctx.destination);
  // Phase 4: live recording tap (post-limiter, post-analyser). OfflineAudioContext
  // has no createMediaStreamDestination, so WAV-export clones skip this automatically.
  if(ctx.createMediaStreamDestination){
    this.recTap=ctx.createMediaStreamDestination();
    this.analyser.connect(this.recTap);
  }
  this.duck=ctx.createGain(); this.duck.gain.value=1;
  this.duck.connect(this.master);
  PART_NAMES.forEach(function(n){
    var g=ctx.createGain(); g.gain.value=1;
    if(n==="BASS"||n==="PAD"){ g.connect(self.duck); } else { g.connect(self.master); }
    self.partGains[n]=g;
  });
  this.delayIn=ctx.createGain(); this.delayIn.gain.value=this.knobVals.delay*0.9;
  this.dL=ctx.createDelay(2.0); this.dR=ctx.createDelay(2.0);
  var fb1=ctx.createGain(); fb1.gain.value=0.42;
  var fb2=ctx.createGain(); fb2.gain.value=0.42;
  this.delayIn.connect(this.dL);
  this.dL.connect(fb1); fb1.connect(this.dR);
  this.dR.connect(fb2); fb2.connect(this.dL);
  var wetL=ctx.createGain(); wetL.gain.value=0.9;
  var wetR=ctx.createGain(); wetR.gain.value=0.9;
  if(ctx.createStereoPanner){
    var panL=ctx.createStereoPanner(); panL.pan.value=-0.65;
    var panR=ctx.createStereoPanner(); panR.pan.value=0.65;
    this.dL.connect(wetL); wetL.connect(panL); panL.connect(this.master);
    this.dR.connect(wetR); wetR.connect(panR); panR.connect(this.master);
  } else {
    this.dL.connect(wetL); wetL.connect(this.master);
    this.dR.connect(wetR); wetR.connect(this.master);
  }
  this.updateDelayTime();
  this.reverbIn=ctx.createGain(); this.reverbIn.gain.value=this.knobVals.reverb*0.9;
  var conv=ctx.createConvolver(); conv.buffer=this.makeImpulse(1.9,2.4);
  var revOut=ctx.createGain(); revOut.gain.value=1.0;
  this.reverbIn.connect(conv); conv.connect(revOut); revOut.connect(this.master);
  this.noiseBuf=makeNoiseBuffer(ctx);
  this.voices=makeVoices(ctx,this.partGains,{delay:this.delayIn,reverb:this.reverbIn},this.noiseBuf,this.cfg.bind(this)); // Phase 2: live genre config per note
  this.updateDrive();
  this.applyKnob("filter"); this.applyKnob("res"); this.applyKnob("swing");
  this.applySongSection(sectionAt(this.song,0).section);
  if(ctx.state==="suspended"&&ctx.resume) return ctx.resume(); // defensive: offline ctx never suspends
  return Promise.resolve();
};
Groovebox.prototype.makeImpulse=function(dur,decay){
  var ctx=this.ctx,len=Math.floor(ctx.sampleRate*dur);
  var buf=ctx.createBuffer(2,len,ctx.sampleRate);
  for(var ch=0;ch<2;ch++){
    var d=buf.getChannelData(ch);
    for(var i=0;i<len;i++){ d[i]=(Math.random()*2-1)*Math.pow(1-i/len,decay); }
  }
  return buf;
};
Groovebox.prototype.updateDelayTime=function(){
  if(!this.ctx||!this.dL) return;
  var beat=60/this.bpm;
  this.dL.delayTime.setTargetAtTime(beat*0.75,this.ctx.currentTime,0.08);
  this.dR.delayTime.setTargetAtTime(beat*0.75,this.ctx.currentTime,0.08);
};
Groovebox.prototype.updateDrive=function(){
  if(!this.ctx) return;
  var v=this.knobVals.drive;
  var k=1+v*8;
  var n=512,curve=new Float32Array(n);
  var norm=Math.tanh(k);
  for(var i=0;i<n;i++){ var x=i/(n-1)*2-1; curve[i]=Math.tanh(k*x)/norm; }
  if(this.shaper) this.shaper.curve=curve;
  if(this.drivePre) this.drivePre.gain.value=1+v*2.5;
  if(this.drivePost) this.drivePost.gain.value=1/(1+v*1.2);
};
Groovebox.prototype.applyKnob=function(name){
  var v=this.knobVals[name];
  if(name==="bpm"){ this.bpm=120+v*45; this.updateDelayTime(); return; }
  if(!this.ctx) return;
  if(name==="filter"){
    // Phase 2: DJ filter modes. LP (default) behaves exactly as before;
    // HP sweeps the lows out (v=1 open at 20Hz, v=0 cuts up to 20kHz) —
    // the other half of DJ-style filtering psy sets need.
    var hz;
    if(this.filterMode==="HP"){
      hz=20*Math.pow(1000,(1-v)*(1-v));
      if(this.djFilter.type!=="highpass") this.djFilter.type="highpass";
    }else{
      hz=80*Math.pow(225,v*v);
      if(this.djFilter.type!=="lowpass") this.djFilter.type="lowpass";
    }
    this.djFilter.frequency.setTargetAtTime(hz,this.ctx.currentTime,0.03);
  }
  else if(name==="res"){ this.djFilter.Q.value=0.4+v*9; }
  else if(name==="drive"){ this.updateDrive(); }
  else if(name==="delay"){ this.delayIn.gain.value=v*0.9; }
  else if(name==="reverb"){ this.reverbIn.gain.value=v*0.9; }
  else if(name==="swing"){ this.swing=v*0.6; }
  else if(name==="duck"){ this.duckDepth=1-v*0.8; } // Phase 2: v=0 -> no duck (1.0), v=1 -> deep (0.2)
};
Groovebox.prototype.toggleFilterMode=function(){
  // Phase 2: LP <-> HP for the DJ filter (UI button on the filter knob).
  this.filterMode=(this.filterMode==="HP")?"LP":"HP";
  this.applyKnob("filter");
  if(typeof setStatus==="function") setStatus("FILTER MODE: "+this.filterMode,"ok");
  if(typeof renderKnob==="function") renderKnob("filter");
  if(typeof trackEvent==="function") trackEvent("filter_mode",{mode:this.filterMode});
};
Groovebox.prototype.setKnob=function(name,v){
  this.knobVals[name]=clamp(v,0,1);
  this.applyKnob(name);
  if(typeof renderKnob==="function") renderKnob(name);
};
Groovebox.prototype.play=function(){
  var self=this;
  return this.init().then(function(){
    hideLoading();
    if(self.isPlaying) return;
    self.isPlaying=true;
    self.uiQueue=[];
    self._barCacheKey=-1; self._lastSecIdx=-1;
    self.nextNoteTime=self.ctx.currentTime+0.06;
    self.updateDelayTime();
    // Web Worker replaced with setInterval (CSP fix)
    self.timerId=setInterval(function(){self.scheduler();},25);
    // Phase 4: MIDI transport start + clock grid origin
    if(typeof MIDIOut!=="undefined"&&MIDIOut.port){ MIDIOut.transportStart(); }
    self._nextClock=self.ctx.currentTime+0.06;
  });
};
Groovebox.prototype.stop=function(){
  this.isPlaying=false;
  if(this.timerId){ if(this.timerId.stop)this.timerId.stop();else clearInterval(this.timerId); this.timerId=null; }
  if(typeof MIDIOut!=="undefined"&&MIDIOut.port){ MIDIOut.transportStop(); } // Phase 4: MIDI transport stop
};
Groovebox.prototype.scheduler=function(){
  try{
    while(this.nextNoteTime<this.ctx.currentTime+0.2){
      var step=this.absStep%16;
      var t=this.nextNoteTime;
      if(step%2===1) t+=this.swing*this.stepDur()*0.5;
      this.scheduleStep(this.absStep,t);
      // Phase 4: 24ppq MIDI clock - 6 ticks per 16th on the unswung grid
      if(typeof MIDIOut!=="undefined"&&MIDIOut.port&&MIDIOut.clockEnabled){
        var csd=this.stepDur();
        for(var ck=0;ck<6;ck++){ MIDIOut.clock(audioToPerf(this.ctx,this.nextNoteTime+csd*ck/6)); }
      }
      this.uiQueue.push({step:step,time:this.nextNoteTime});
      this.nextNoteTime+=this.stepDur();
      this.absStep++;
    // Check if there's a pending seek
    if(this.pendingSeekBar!==null && this.absStep%16===0){
      var pendingBar=this.pendingSeekBar;
      this.pendingSeekBar=null;
      this._doSeekToBar(pendingBar);
      return;
    }
    }
  }catch(e){ if(!this._schedErrLogged){ this._schedErrLogged=true; console.error('scheduler error:', e); } } // Phase 0: no silent swallow
};


Groovebox.prototype.refreshPartGains=function(t){
  this.applySongSection(sectionAt(this.song,Math.floor(this.absStep/16)).section);
};
Groovebox.prototype.jumpSection=function(){
  var cur=sectionAt(this.song,Math.floor(this.absStep/16));
  var nextIdx=(cur.sectionIndex+1)%this.song.sections.length;
  this.seekToBar(this.song.sectionStarts[nextIdx]);
};
Groovebox.prototype.seekToBar=function(bar){
  // Quantize: wait for end of current bar before seeking
  var currentBar=Math.floor(this.absStep/16);
  var barInCurrentBar=this.absStep%16;
  if(barInCurrentBar>0 && this.isPlaying){
    // We're in the middle of a bar, queue the seek
    this.pendingSeekBar=bar;
    this.updateLcd();
    return;
  }
  // We're at the start of a bar, seek immediately
  this._doSeekToBar(bar);
};
Groovebox.prototype._doSeekToBar=function(bar){
  this._barCacheKey=-1;
  this.uiQueue.length=0;
  this.absStep=bar*16;
  if(this.isPlaying){ this.nextNoteTime=this.ctx.currentTime+0.06; }
  else{ this.play(); }
  this.updateLcd();
};
Groovebox.prototype.variate=function(auto){
  this.seed=(this.seed+0x9E3779B9)>>>0;
  this.patterns=makePatterns(this.seed);
  this.sectionPatterns={}; // Phase 2 BarPlan: new variation = fresh per-section baseline
  this.patternEdited={bass:false,lead:false}; // Phase 2: new seed restores arrangement control
  this.song=buildSong(this.seed);
  this.variation++;
  this.lastLeadMidi=null;
  this._barCacheKey=-1; this._lastSecIdx=-1;
  if(typeof refreshSeqUi==="function") refreshSeqUi();
  if(typeof renderTimelineFor==="function") renderTimelineFor(this);
  this.updateLcd();
  if(!auto && typeof commitUndo==="function") commitUndo(); // Phase 0c: undo across manual re-seeds
};
Groovebox.prototype.scheduleStep=function(absStep,t){
  var song=this.song;
  var v=this.voices;
  if(!song||!v) return;
  var m=this.mutes;
  var sd=this.stepDur();
  var step=absStep%16;
  var absBar=Math.floor(absStep/16);
  var info=sectionAt(song,absBar);
  var section=info.section;
  var barInSection=info.barInSection;
  var barRng=rngFor(song.seed,"bar:"+info.barInTrack);
  var energy=energyAt(section.name,barInSection,section.bars);
  var auto=automationFromEnergy(energy);
  var pat=this.patternsFor(section.name); // Phase 2 BarPlan
  var pl=this.partLen||{}; // Session 28: per-part loop length

  if(step===0) this.onBar(absBar,t);

  var nextIdx=(info.sectionIndex+1)%song.sections.length;
  var nextSection=song.sections[nextIdx];
  var gated=isPreDropSilenceBar(nextSection.name,barInSection,section.bars)&&!preDropGate(step);

  // Phase 2: kick is read from the user-editable pattern grid. The seeded
  // default (makePatterns) is four-on-the-floor, sonically identical to the
  // old hardcoded KICK_STEPS constant (still used by BassStyles.gallop).
  var kp=pat.kick; // BarPlan
  if(kp&&kp[absStep%(pl.KICK||16)]&&!gated&&!m.KICK){
    v.kick(t);
    if(typeof updateGrammars==="function")updateGrammars("kick",step,0);
    if(this.duck){
      // Phase 2: user-adjustable sidechain depth (DUCK knob; default 0.40 = legacy)
      var dd=(typeof this.duckDepth==="number")?this.duckDepth:0.40;
      this.duck.gain.cancelScheduledValues(t);
      this.duck.gain.setValueAtTime(1,t);
      this.duck.gain.setTargetAtTime(dd,t,0.006);
      this.duck.gain.setTargetAtTime(1.0,t+0.055,0.03);
    }
  }
  if(barInSection===0&&step===0&&!m.PERC){
    v.crash(t,(section.name==="DROP"||section.name==="DROP2")?1.0:0.6);
  }
  var bassRoot=song.root+(section.rootOffset||0);
  var scale=SCALES[song.modes[section.mode]];
  if(this.patternEdited.bass){
    // Phase 2 TAKEOVER: user-edited pattern overrides the section bass style.
    // Entries {n: semitone offset from bassRoot, s?: sustain in steps}.
    var bpe=pat.bass[absStep%(pl.BASS||16)]; // BarPlan + Session 28 loop length
    if(bpe&&!gated&&!m.BASS){
      var bdur=bpe.s?bpe.s*sd:sd*0.8;
      v.bassNote(t,bassRoot+(bpe.n||0),bdur);
      if(typeof updateGrammars==="function")updateGrammars("bass",step,bassRoot+(bpe.n||0));
    }
  } else {
    var bassBar=generateBassBar(section.bassStyle,bassRoot,scale,barInSection,barRng);
    var bassEvent=bassBar[step];
    if(bassEvent&&!gated&&!m.BASS){
      var dur=bassEvent.sustain?bassEvent.sustain*sd:sd*0.8;
      v.bassNote(t,bassEvent.midi,dur);
      if(typeof updateGrammars==="function")updateGrammars("bass",step,bassEvent.midi);
    }
  }
  if(section.name!=="BREAK"&&!m.PERC){
    if(!gated){
      // Phase 2: base groove is read from the user-editable pattern grid
      // (deterministic per seed). The clap energy gate from the old inline
      // logic is preserved; arrangement fills below remain section-driven.
      var pe=pat.perc[absStep%(pl.PERC||16)]; // BarPlan + Session 28 loop length
      var pprob=(this.chance&&this.chance.PERC&&typeof this.chance.PERC[step]==="number")?this.chance.PERC[step]:1; // Session 34: chance
      if(pe&&Math.random()<=pprob){
        if(pe==="clap"){ if(energy>0.3) v.clap(t,0.7*auto.velocityMul); }
        else if(pe==="shaker"){ v.shaker(t,0.5*auto.velocityMul); }
        else if(pe==="oh"){ v.openhat(t,0.35); }
      }
    }
    var barsLeft=section.bars-1-barInSection;
    if(barsLeft<=1&&(section.name==="BUILD"||section.name==="RISER"||section.name==="INTRO")){
      var fillProgress=1-(barsLeft*16+(15-step))/32;
      if(barRng()<0.2+0.6*fillProgress) v.snare(t,0.3+0.5*fillProgress);
    }
  }
  if(sectionHasPart(section,"lead")&&!m.LEAD){
    if(this.patternEdited.lead){
      // Phase 2 TAKEOVER: user-edited motif overrides the section theme.
      // Entries {deg, dur, accent|acc, rest}; deg indexes SCALE_EXT at ROOT+24.
      var lpe=pat.lead[absStep%(pl.LEAD||16)]; // BarPlan + Session 28 loop length
      if(lpe&&!lpe.rest){
        var lmidi=ROOT+24+SCALE_EXT[lpe.deg];
        var laccent=(lpe.accent!=null)?lpe.accent:(lpe.acc||0);
        var laccLvl=Math.max(0,Math.min(1,laccent*auto.velocityMul));
        var laccSteps=laccLvl>=0.8?2:(laccLvl>=0.5?1:0);
        var lprev=this.lastLeadMidi;
        var liv=(lprev!=null)?Math.abs(lmidi-lprev):0;
        var lslide=(liv===2||liv===3)&&lprev!=null;
        v.leadNote(t,lmidi,{acc:laccSteps,slide:lslide,fromMidi:lprev,gate:(lpe.dur||1)*sd*0.92}); // Phase 2: edited motifs sustain too
        if(typeof updateGrammars==="function") updateGrammars("lead",step,lmidi); // Phase 3: melodic learning (takeover)
        if(typeof MIDIOut!=="undefined"&&MIDIOut.port&&!this.suppressMidi){ // Phase 4: LEAD notes out (takeover)
          MIDIOut.noteOn(lmidi,laccSteps>=2?120:(laccSteps>=1?100:80),audioToPerf(this.ctx,t));
          MIDIOut.noteOff(lmidi,audioToPerf(this.ctx,t+(lpe.dur||1)*sd*0.92));
        }
        this.lastLeadMidi=lmidi;
      }
    } else {
      if(this._barCacheKey!==absBar){
        this._barCacheKey=absBar;
        var theme=song.themes[section.themeKey];
        this._leadBarNotes=resolveThemeBar(theme,barInSection,SCALES);
        this._leadStepCursor=0;
        this._leadStepAcc=0;
      }
      if(this._leadStepAcc===step){
        var ev=this._leadBarNotes[this._leadStepCursor];
        if(ev&&!ev.rest){
          var accLvl=Math.max(0,Math.min(1,ev.accent*auto.velocityMul));
          var accSteps=accLvl>=0.8?2:(accLvl>=0.5?1:0);
          var prevMidi=this.lastLeadMidi;
          var iv=(prevMidi!=null)?Math.abs(ev.midi-prevMidi):0;
          var slide=(iv===2||iv===3)&&prevMidi!=null;
          v.leadNote(t,ev.midi,{acc:accSteps,slide:slide,fromMidi:prevMidi,gate:ev.dur*sd*0.92}); // Phase 2: sustain the written length
          if(typeof updateGrammars==="function") updateGrammars("lead",step,ev.midi); // Phase 3: melodic learning
          if(typeof MIDIOut!=="undefined"&&MIDIOut.port&&!this.suppressMidi){ // Phase 4: LEAD notes out
            MIDIOut.noteOn(ev.midi,accSteps>=2?120:(accSteps>=1?100:80),audioToPerf(this.ctx,t));
            MIDIOut.noteOff(ev.midi,audioToPerf(this.ctx,t+ev.dur*sd*0.92));
          }
          this.lastLeadMidi=ev.midi;
        }
        this._leadStepAcc+=(ev?ev.dur:1);
        this._leadStepCursor++;
      }
    }
  }
  if(sectionHasPart(section,"arp")&&!m.ARP){
    var an=pat.arp[absStep%(pl.ARP||16)]; // BarPlan + Session 28 loop length
    var aprob=(this.chance&&this.chance.ARP&&typeof this.chance.ARP[step]==="number")?this.chance.ARP[step]:1; // Session 34: chance
    if(an&&(Math.random()<=aprob)) v.arpNote(t,ROOT+24+SCALE_EXT[an.deg],step%4===0);
  }
  if(sectionHasPart(section,"pad")&&!m.PAD&&barInSection%2===0){
    // Phase 2: pad chords are read from the pattern grid. Seeded default is
    // {chord:[0,7,12]} at step 0 => exactly the old voicing
    // (root/fifth/octave above bassRoot+12; modal, no third).
    var pp=pat.pad[absStep%(pl.PAD||16)]; // BarPlan + Session 28 loop length
    if(pp&&pp.chord){
      var padMidis=[];
      for(var pi2=0;pi2<pp.chord.length;pi2++){ padMidis.push(bassRoot+12+pp.chord[pi2]); }
      v.padChord(t,padMidis,sd*32*0.95);
    }
  }
};

Groovebox.prototype.onBar=function(absBar,t){
  var info=sectionAt(this.song,absBar);
  this.arr.secIdx=info.sectionIndex;
  this.arr.barInSec=info.barInSection;
  this.arr.cycle=Math.floor(absBar/this.song.totalBars);
  if(this.arr.cycle>this._lastCycle){this._lastCycle=this.arr.cycle;this.variate(true);}
  if(this._lastSecIdx!==info.sectionIndex){
    this._lastSecIdx=info.sectionIndex;
    this.applySongSection(info.section);
    if(typeof updateTimelineUi==="function") updateTimelineUi(info.sectionIndex);
    if(typeof refreshSeqUi==="function") refreshSeqUi(); // BarPlan: grid follows the section
  }
  var energy=energyAt(info.section.name,info.barInSection,info.section.bars);
  var auto=automationFromEnergy(energy);
  if(this.autoFilter) this.autoFilter.frequency.setTargetAtTime(auto.filterCutoffHz,t,0.08);
  if(this.delayIn) this.delayIn.gain.setTargetAtTime(Math.max(0.05,auto.delaySend),t,0.1);
  if(this.reverbIn) this.reverbIn.gain.setTargetAtTime(Math.max(0.05,auto.reverbSend),t,0.1);
  this.updateLcd();
};
Groovebox.prototype.applySongSection=function(section){
  if(!this.ctx||!this.partGains||!this.partGains.KICK) return;
  var t=this.ctx.currentTime;
  for(var i=0;i<PART_NAMES.length;i++){
    var n=PART_NAMES[i];
    var target;
    if(n==="KICK"||n==="PERC"||n==="BASS") target=1;
    else target=sectionHasPart(section,n.toLowerCase())?1:0;
    if(this.mutes[n]) target=0;
    this.partGains[n].gain.setTargetAtTime(target,t,0.12);
  }
};

Groovebox.prototype.triggerPad=function(deg){
  var self=this;
  return this.init().then(function(){
    self.voices.leadNote(self.ctx.currentTime+0.01,ROOT+24+SCALE_EXT[deg],{acc:true});
  }).catch(function(){ });
};
Groovebox.prototype.getEnergy=function(){
  if(!this.analyser) return 0;
  this.analyser.getByteTimeDomainData(this._timeBuf);
  var sum=0;
  for(var i=0;i<this._timeBuf.length;i++){ var x=(this._timeBuf[i]-128)/128; sum+=x*x; }
  return Math.sqrt(sum/this._timeBuf.length);
};
Groovebox.prototype.updateLcd=debounce(function(){
  var info=sectionAt(this.song,Math.floor(this.absStep/16));
  var sec=info.section;
  var l1=$("lcd1"),l2=$("lcd2");
  if(l1) l1.textContent=sec.name+"  BAR "+(info.barInSection+1)+"/"+sec.bars;
  if(l2) l2.textContent=STYLE.name+"  BPM "+Math.round(this.bpm)+"  VAR "+this.variation+"  CYCLE "+this.arr.cycle;
  var np=$("nowPlaying");
  if(np) np.textContent=sec.name+" \u00b7 theme "+sec.themeKey+" \u00b7 "+sec.bassStyle+" bass";
}, 16);

// Preview a sequencer step
Groovebox.prototype.previewStep=function(stepIdx){
  if(!this.ctx)return;
  var t=this.ctx.currentTime+0.01;
  // Play a short preview sound
  var o=this.ctx.createOscillator();
  var g=this.ctx.createGain();
  o.type='sine';
  o.frequency.value=440+stepIdx*50;
  g.gain.setValueAtTime(0.3,t);
  g.gain.exponentialRampToValueAtTime(0.001,t+0.1);
  o.connect(g);
  g.connect(this.master);
  o.start(t);
  o.stop(t+0.1);
};
Groovebox.prototype.selfTest=function(){
  // Phase 0c: real structural checks. The previous version returned
  // hardcoded fake values ({ok:true,rms:0.1,peak:0.5}) unconditionally.
  var problems=[];
  if(!this.song||!this.song.sections||this.song.sections.length!==7) problems.push("song-structure");
  if(!this.song||!(this.song.totalBars>0)) problems.push("total-bars");
  if(!this.patterns||!this.patterns.arp||this.patterns.arp.length!==16) problems.push("patterns");
  if(!this.song||!this.song.themes||!this.song.themes.A) problems.push("themes");
  if(typeof makeVoices!=="function") problems.push("voice-factory");
  var live=!!(this.ctx&&this.analyser);
  var rms=live?+this.getEnergy().toFixed(4):0;
  return Promise.resolve({ok:problems.length===0,reason:problems.join(","),rms:rms,peak:rms,live:live});
};
Groovebox.prototype.report=function(){
  var info=sectionAt(this.song,Math.floor(this.absStep/16));
  return {version:"4.0.0-m2-song",style:STYLE.name,playing:this.isPlaying,bpm:Math.round(this.bpm),
    section:info.section.name,theme:info.section.themeKey,bar:info.barInSection,
    cycle:this.arr.cycle,variation:this.variation,totalBars:this.song.totalBars,
    step:this.absStep%16,absStep:this.absStep,energy:+this.getEnergy().toFixed(4),
    mutes:JSON.parse(JSON.stringify(this.mutes))};
};

/* ---------- device + UI ---------- */
var device;
function trackEvent(name,detail){
  try{
    var arr=JSON.parse(localStorage.getItem("psy6_events")||"[]");
    arr.push({name:name,detail:detail||{},ts:Date.now()});
    localStorage.setItem("psy6_events",JSON.stringify(arr.slice(-200)));
  }catch(e){}
}
var statusTimer=null;
function setStatus(msg,kind){
  var s=$("status"); if(!s) return;
  s.textContent=msg; s.className="status mono "+(kind||"");
  if(statusTimer)clearTimeout(statusTimer);
  statusTimer=setTimeout(function(){ s.textContent=""; },6000);
}