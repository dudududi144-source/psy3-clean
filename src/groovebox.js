

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
  this.isPlaying=false; this.absStep=0; this.nextNoteTime=0; this.timerId=null;
  this.uiQueue=[];
  this.bpm=145; this.swing=0; // Phase 2: psytrance is straight; swing available via knob
  this.seed=1337; this.variation=1;
  this.patterns=makePatterns(this.seed);
  this.song=buildSong(this.seed);
  this._barCacheKey=-1;
  this._lastSecIdx=-1;
  this.arr={secIdx:0,barInSec:0,cycle:0};
  this._lastCycle=0;
  this.mutes={KICK:0,BASS:0,PERC:0,LEAD:0,ARP:0,PAD:0};
  this.knobVals={bpm:(145-120)/45,filter:1,res:0.15,drive:0.15,delay:0.35,reverb:0.30,swing:0};
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

Groovebox.prototype.cfg=function(){
  var gs=window._genreSound||GENRE_SOUND_CONFIG["FULL-ON"];
  return {
    bassWave:gs.bassWave, bassCut:gs.bassCut, bassRes:gs.bassRes, bassLvl:gs.bassLvl,
    leadCut:gs.leadCut, leadRes:gs.leadRes, leadLvl:gs.leadLvl,
    arpCut:gs.arpCut, arpRes:gs.arpRes, arpLvl:gs.arpLvl,
    padLvl:gs.padLvl, padCut:gs.padCut,
    kickStart:gs.kickStart||150, kickEnd:gs.kickEnd||55, kickDecay:gs.kickDecay||.10, kickPunch:gs.kickPunch||.35,
    hatFreq:gs.hatFreq||8000, hatDecay:gs.hatDecay||.04,
    percTune:gs.percTune||1.0, percDecay:gs.percDecay||.4
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

/* ============================================================
   POOLED ENGINE — Zero GC Architecture (Phase A1)
   Inspired by PSY6-ULTIMATE PooledEngine
   ============================================================
   
   Problem: Creating Web Audio nodes per-note causes GC pauses
   leading to audio dropouts.
   
   Solution: Pre-allocate all voices at init. Reuse via round-robin.
   
   - SYNTH_VOICES = 20 (melodic: bass, lead, arp, pad)
   - DRUM_VOICES = 24 (percussive: kick, snare, hat, perc)
   
   Each voice:
   - Created ONCE at AudioContext init
   - All nodes pre-connected (osc -> filter -> vca -> bus)
   - noteOn() only updates parameters (freq, gain, envelope)
   - panic() cancels scheduled values and zeroes gain
   ============================================================ */

var PooledEngine = {
  ctx: null,
  synthVoices: [],
  drumVoices: [],
  SYNTH_VOICE_COUNT: 20,
  DRUM_VOICE_COUNT: 24,
  nextSynthVoice: 0,
  nextDrumVoice: 0,
  masterBus: null,
  isInitialized: false,
  
  init: function(ctx, masterBus) {
    if (this.isInitialized) return;
    
    this.ctx = ctx;
    this.masterBus = masterBus;
    
    // Pre-allocate synth voices
    for (var i = 0; i < this.SYNTH_VOICE_COUNT; i++) {
      this.synthVoices.push(this.createSynthVoice(ctx, masterBus));
    }
    
    // Pre-allocate drum voices
    for (var i = 0; i < this.DRUM_VOICE_COUNT; i++) {
      this.drumVoices.push(this.createDrumVoice(ctx, masterBus));
    }
    
    this.isInitialized = true;
    console.log('PooledEngine initialized: ' + this.SYNTH_VOICE_COUNT + ' synth + ' + this.DRUM_VOICE_COUNT + ' drum voices');
  },
  
  createSynthVoice: function(ctx, bus) {
    // Create voice nodes ONCE
    var osc1 = ctx.createOscillator();
    var osc2 = ctx.createOscillator();
    var filter = ctx.createBiquadFilter();
    var vca = ctx.createGain();
    
    // Configure
    osc1.type = 'sawtooth';
    osc2.type = 'square';
    filter.type = 'lowpass';
    filter.frequency.value = 8000;
    filter.Q.value = 2;
    vca.gain.value = 0;
    
    // Connect: osc -> filter -> vca -> bus
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(vca);
    vca.connect(bus);
    
    // Start oscillators (they run continuously)
    osc1.start();
    osc2.start();
    
    return {
      osc1: osc1,
      osc2: osc2,
      filter: filter,
      vca: vca,
      isActive: false,
      noteOn: function(freq, velocity, t) {
        this.isActive = true;
        this.osc1.frequency.setTargetAtTime(freq, t, 0.001);
        this.osc2.frequency.setTargetAtTime(freq * 1.005, t, 0.001);
        this.vca.gain.cancelScheduledValues(t);
        this.vca.gain.setTargetAtTime(velocity * 0.3, t, 0.005);
      },
      noteOff: function(t) {
        this.isActive = false;
        this.vca.gain.setTargetAtTime(0, t, 0.05);
      },
      panic: function(t) {
        this.isActive = false;
        this.vca.gain.cancelScheduledValues(t);
        this.vca.gain.setValueAtTime(0, t);
      }
    };
  },
  
  createDrumVoice: function(ctx, bus) {
    // Create voice nodes ONCE
    var osc = ctx.createOscillator();
    var noise = ctx.createBufferSource();
    var noiseGain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    var vca = ctx.createGain();
    
    // Configure
    osc.type = 'sine';
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
    vca.gain.value = 0;
    noiseGain.gain.value = 0;
    
    // Create noise buffer
    var bufferSize = ctx.sampleRate * 0.5;
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noise.buffer = buffer;
    noise.loop = true;
    
    // Connect
    osc.connect(filter);
    noise.connect(noiseGain);
    noiseGain.connect(filter);
    filter.connect(vca);
    vca.connect(bus);
    
    // Start
    osc.start();
    noise.start();
    
    return {
      osc: osc,
      noise: noise,
      noiseGain: noiseGain,
      filter: filter,
      vca: vca,
      isActive: false,
      trigger: function(type, velocity, t) {
        this.isActive = true;
        this.vca.gain.cancelScheduledValues(t);
        
        if (type === 'kick') {
          this.osc.frequency.setValueAtTime(150, t);
          this.osc.frequency.exponentialRampToValueAtTime(50, t + 0.05);
          this.vca.gain.setValueAtTime(velocity * 0.8, t);
          this.vca.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        } else if (type === 'snare') {
          this.noiseGain.gain.setValueAtTime(velocity * 0.5, t);
          this.noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          this.osc.frequency.setValueAtTime(200, t);
          this.vca.gain.setValueAtTime(velocity * 0.3, t);
          this.vca.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        } else if (type === 'hat') {
          this.noiseGain.gain.setValueAtTime(velocity * 0.3, t);
          this.noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        } else {
          this.vca.gain.setValueAtTime(velocity * 0.4, t);
          this.vca.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        }
      },
      panic: function(t) {
        this.isActive = false;
        this.vca.gain.cancelScheduledValues(t);
        this.vca.gain.setValueAtTime(0, t);
        this.noiseGain.gain.cancelScheduledValues(t);
        this.noiseGain.gain.setValueAtTime(0, t);
      }
    };
  },
  
  // Get next available synth voice (round-robin)
  nextSynth: function() {
    var voice = this.synthVoices[this.nextSynthVoice];
    this.nextSynthVoice = (this.nextSynthVoice + 1) % this.SYNTH_VOICE_COUNT;
    return voice;
  },
  
  // Get next available drum voice (round-robin)
  nextDrum: function() {
    var voice = this.drumVoices[this.nextDrumVoice];
    this.nextDrumVoice = (this.nextDrumVoice + 1) % this.DRUM_VOICE_COUNT;
    return voice;
  },
  
  // Panic: stop all voices
  panic: function() {
    var t = this.ctx.currentTime;
    for (var i = 0; i < this.synthVoices.length; i++) {
      this.synthVoices[i].panic(t);
    }
    for (var i = 0; i < this.drumVoices.length; i++) {
      this.drumVoices[i].panic(t);
    }
  }
};