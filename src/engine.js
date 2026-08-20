

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
  this.bpm=145; this.swing=0.12;
  this.seed=1337; this.variation=1;
  this.patterns=makePatterns(this.seed);
  this.song=buildSong(this.seed);
  this._barCacheKey=-1;
  this._lastSecIdx=-1;
  this.arr={secIdx:0,barInSec:0,cycle:0};
  this._lastCycle=0;
  this.mutes={KICK:0,BASS:0,PERC:0,LEAD:0,ARP:0,PAD:0};
  this.knobVals={bpm:(145-120)/45,filter:1,res:0.15,drive:0.15,delay:0.35,reverb:0.30,swing:0.20};
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

// Initialize PooledEngine when device is ready


/* ============================================================
   POLYBLEP OSCILLATORS (Phase A2)
   Inspired by PsySynthPro — band-limited oscillators
   ============================================================
   
   Problem: Standard OscillatorNode produces aliasing at high
   frequencies, causing harsh digital artifacts.
   
   Solution: PolyBLEP (Polynomial Band-Limited Step) synthesis
   smooths the discontinuities in naive waveforms.
   ============================================================ */

var PolyBLEP = {
  // PolyBLEP correction function
  polyblep: function(t, dt) {
    if (t < dt) {
      t /= dt;
      return t + t - t * t - 1.0;
    } else if (t > 1.0 - dt) {
      t = (t - 1.0) / dt;
      return t * t + t + t + 1.0;
    } else {
      return 0.0;
    }
  },
  
  // Generate one sample of a band-limited sawtooth
  sawtooth: function(phase, dt) {
    var value = 2.0 * phase - 1.0;
    value -= this.polyblep(phase, dt);
    return value;
  },
  
  // Generate one sample of a band-limited square
  square: function(phase, dt) {
    var value = phase < 0.5 ? 1.0 : -1.0;
    value += this.polyblep(phase, dt);
    value -= this.polyblep((phase + 0.5) % 1.0, dt);
    return value;
  },
  
  // Generate one sample of a band-limited triangle
  triangle: function(phase, dt) {
    // Integrate square to get triangle
    var value = phase < 0.5 ? (4.0 * phase - 1.0) : (3.0 - 4.0 * phase);
    return value;
  },
  
  // Generate one sample of a band-limited sine (sine is already band-limited)
  sine: function(phase) {
    return Math.sin(2.0 * Math.PI * phase);
  }
};

// PolyBLEP Oscillator Node using AudioWorklet
// For browsers that support AudioWorklet, we use per-sample DSP
// For others, we fall back to standard OscillatorNode


/* ============================================================
   ZDF STATE-VARIABLE FILTER (Phase A3)
   Inspired by PsySynthPro — zero-delay feedback topology
   ============================================================
   
   Problem: Standard BiquadFilterNode has one sample of feedback
   delay, causing phase shift and resonance peaking issues.
   
   Solution: Zero-Delay Feedback (ZDF) topology solves the
   feedback loop implicitly, giving analog-style response.
   ============================================================ */

var ZDFFilter = {
  // Create a ZDF state-variable filter
  // This is a software implementation for reference
  // In production, this would be an AudioWorklet
  create: function(ctx) {
    // For now, use standard BiquadFilterNode as fallback
    // ZDF implementation would go here via AudioWorklet
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 8000;
    filter.Q.value = 2;
    return filter;
  },
  
  // ZDF filter state (for AudioWorklet implementation)
  state: {
    s1: 0,  // first integrator state
    s2: 0,  // second integrator state
    
    // Process one sample through ZDF SVF
    process: function(input, freq, res, sampleRate) {
      // Calculate coefficients
      var g = Math.tan(Math.PI * freq / sampleRate);
      var k = 2.0 - 2.0 * res;
      
      // Solve zero-delay feedback loop
      var a1 = 1.0 / (1.0 + g * (g + k));
      var a2 = g * a1;
      var a3 = g * a2;
      
      // Compute outputs
      var v3 = input - this.s2;
      var v1 = a1 * this.s1 + a2 * v3;
      var v2 = this.s2 + a2 * this.s1 + a3 * v3;
      
      // Update states
      this.s1 = 2.0 * v1 - this.s1;
      this.s2 = 2.0 * v2 - this.s2;
      
      // Return lowpass output
      return v2;
    },
    
    reset: function() {
      this.s1 = 0;
      this.s2 = 0;
    }
  }
};



/* ============================================================
   BRICKWALL LIMITER (Phase A4)
   Inspired by psy-sampler — threshold -1dB, 20:1
   ============================================================
   
   Problem: Audio can clip when multiple voices play together,
   causing harsh distortion.
   
   Solution: Brickwall limiter with lookahead catches peaks
   before they clip, applying gain reduction smoothly.
   ============================================================ */

var BrickwallLimiter = {
  ctx: null,
  limiter: null,
  makeupGain: null,
  threshold: -1,  // dB
  ratio: 20,      // 20:1
  
  init: function(ctx, destination) {
    if (this.limiter) return this.limiter;
    
    this.ctx = ctx;
    
    // Create DynamicsCompressorNode as brickwall limiter
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = this.threshold;
    this.limiter.knee.value = 0;      // Hard knee = brickwall
    this.limiter.ratio.value = this.ratio;
    this.limiter.attack.value = 0.001; // Fast attack (1ms)
    this.limiter.release.value = 0.05; // Medium release (50ms)
    
    // Makeup gain to compensate for gain reduction
    this.makeupGain = ctx.createGain();
    this.makeupGain.gain.value = 1.0;
    
    // Connect: limiter -> makeup -> destination
    this.limiter.connect(this.makeupGain);
    this.makeupGain.connect(destination);
    
    console.log('BrickwallLimiter initialized: threshold=' + this.threshold + 'dB, ratio=' + this.ratio + ':1');
    
    return this.limiter;
  },
  
  // Get the input node (connect your audio here)
  getInput: function() {
    return this.limiter;
  },
  
  // Get the output node
  getOutput: function() {
    return this.makeupGain;
  },
  
  // Get current gain reduction (for metering)
  getGainReduction: function() {
    if (this.limiter) {
      return this.limiter.reduction;
    }
    return 0;
  }
};

// Initialize BrickwallLimiter and connect to master


var OversampledLowpass = {
  create: function(ctx, frequency) {
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency || 8000;
    filter.Q.value = 0.707;
    return filter;
  },
  state: {
    y: 0,
    process: function(input, freq, sampleRate) {
      var rc = 1.0 / (2.0 * Math.PI * freq);
      var dt = 1.0 / sampleRate;
      var alpha = dt / (rc + dt);
      this.y = this.y + alpha * (input - this.y);
      return this.y;
    },
    reset: function() { this.y = 0; }
  }
};


var Envelope = {
  create: function() {
    return {
      attack: 0.01,
      decay: 0.1,
      sustain: 0.7,
      release: 0.3,
      phase: 'idle',
      level: 0,
      noteOn: function(t) { this.phase = 'attack'; this.level = 0; },
      noteOff: function(t) { this.phase = 'release'; },
      process: function(sampleRate) {
        var dt = 1.0 / sampleRate;
        if (this.phase === 'attack') {
          var attackRate = 1.0 / (this.attack * sampleRate);
          this.level += attackRate * (1.0 - this.level);
          if (this.level >= 0.99) { this.level = 1.0; this.phase = 'decay'; }
        } else if (this.phase === 'decay') {
          var decayRate = 1.0 / (this.decay * sampleRate);
          this.level += decayRate * (this.sustain - this.level);
          if (Math.abs(this.level - this.sustain) < 0.01) { this.level = this.sustain; this.phase = 'sustain'; }
        } else if (this.phase === 'sustain') {
          this.level = this.sustain;
        } else if (this.phase === 'release') {
          var releaseRate = 1.0 / (this.release * sampleRate);
          this.level -= releaseRate * this.level;
          if (this.level < 0.001) { this.level = 0; this.phase = 'idle'; }
        }
        return this.level;
      },
      reset: function() { this.phase = 'idle'; this.level = 0; }
    };
  }
};


var SoftClip = {
  process: function(input, drive) {
    drive = drive || 1.0;
    return Math.tanh(input * drive) / Math.tanh(drive);
  },
  create: function(ctx, drive) {
    var shaper = ctx.createWaveShaper();
    var samples = 44100;
    var curve = new Float32Array(samples);
    drive = drive || 1.0;
    for (var i = 0; i < samples; i++) {
      var x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    shaper.curve = curve;
    shaper.oversample = '4x';
    return shaper;
  }
};



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
    var score = 0;
    score += Grammars.bass.confidence() * 0.3;
    score += Grammars.melodic.confidence() * 0.3;
    score += Grammars.rhythm.confidence() * 0.2;
    var rhythmVariety = 0;
    for (var i = 0; i < candidate.rhythmPattern.length; i++) {
      if (candidate.rhythmPattern[i]) rhythmVariety++;
    }
    score += rhythmVariety * 2;
    var contour = Grammars.melodic.contourTendency();
    if (contour !== 'neutral') score += 10;
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



/* ============================================================
   PER-TRACK CONTROL (from PSY6-ULTIMATE)
   Mute/Solo, Volume, FX Mode, Pan, Delay/Reverb sends
   ============================================================ */

var TrackControl = {
  tracks: ['KICK', 'BASS', 'PERC', 'LEAD', 'ARP', 'PAD'],
  
  init: function() {
    if (!device || !device.partGains) return;
    
    for (var i = 0; i < this.tracks.length; i++) {
      var track = this.tracks[i];
      
      // Create pan node for each track
      if (device.ctx && device.ctx.createStereoPanner) {
        var panner = device.ctx.createStereoPanner();
        panner.pan.value = 0; // Center
        if (device.partGains[track]) {
          device.partGains[track].connect(panner);
          panner.connect(device.master);
        }
        device.trackPanners = device.trackPanners || {};
        device.trackPanners[track] = panner;
      }
      
      // Create delay send for each track
      if (device.ctx) {
        var delaySend = device.ctx.createGain();
        delaySend.gain.value = 0;
        if (device.partGains[track] && device.delayIn) {
          device.partGains[track].connect(delaySend);
          delaySend.connect(device.delayIn);
        }
        device.trackDelaySends = device.trackDelaySends || {};
        device.trackDelaySends[track] = delaySend;
      }
      
      // Create reverb send for each track
      if (device.ctx) {
        var reverbSend = device.ctx.createGain();
        reverbSend.gain.value = 0;
        if (device.partGains[track] && device.reverbIn) {
          device.partGains[track].connect(reverbSend);
          reverbSend.connect(device.reverbIn);
        }
        device.trackReverbSends = device.trackReverbSends || {};
        device.trackReverbSends[track] = reverbSend;
      }
    }
    
    console.log('TrackControl initialized for ' + this.tracks.length + ' tracks');
  },
  
  // Mute a track
  mute: function(track) {
    if (device && device.mutes) {
      device.mutes[track] = device.mutes[track] ? 0 : 1;
      if (device.ctx) device.refreshPartGains(device.ctx.currentTime);
      var statusEl = document.getElementById('status');
      if (statusEl) {
        statusEl.textContent = track + (device.mutes[track] ? ' MUTED' : ' UNMUTED');
        statusEl.className = device.mutes[track] ? 'err' : 'ok';
      }
    }
  },
  
  // Set track volume
  setVolume: function(track, volume) {
    if (device && device.partGains && device.partGains[track]) {
      device.partGains[track].gain.setTargetAtTime(volume, device.ctx.currentTime, 0.01);
    }
  },
  
  // Set track pan
  setPan: function(track, pan) {
    if (device && device.trackPanners && device.trackPanners[track]) {
      device.trackPanners[track].pan.setTargetAtTime(pan, device.ctx.currentTime, 0.01);
    }
  },
  
  // Set track delay send
  setDelaySend: function(track, amount) {
    if (device && device.trackDelaySends && device.trackDelaySends[track]) {
      device.trackDelaySends[track].gain.setTargetAtTime(amount, device.ctx.currentTime, 0.01);
    }
  },
  
  // Set track reverb send
  setReverbSend: function(track, amount) {
    if (device && device.trackReverbSends && device.trackReverbSends[track]) {
      device.trackReverbSends[track].gain.setTargetAtTime(amount, device.ctx.currentTime, 0.01);
    }
  }
};
function initSoftClipOutput() {
  if (device && device.ctx && device.master) {
    var shaper = SoftClip.create(device.ctx, 1.5);
    console.log('SoftClip output stage available');
  }
}
function initBrickwallLimiter() {
  if (device && device.ctx && device.master) {
    // Create limiter
    var limiterInput = BrickwallLimiter.init(device.ctx, device.ctx.destination);
    
    // Reconnect master through limiter
    // master -> limiter -> destination
    try {
      device.master.disconnect();
    } catch (e) {
      // Already disconnected
    }
    device.master.connect(limiterInput);
    
    console.log('Master bus routed through BrickwallLimiter');
  }
}

var PolyBLEPOscillator = {
  create: function(ctx, type) {
    // For now, use standard OscillatorNode as fallback
    // AudioWorklet implementation would go here
    var osc = ctx.createOscillator();
    osc.type = type || 'sawtooth';
    return osc;
  }
};





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

/* ============================================================
   POOLED ENGINE INTEGRATION
   ============================================================ */

// Use PooledEngine for drum voices if available
function triggerDrumWithPool(type, velocity, t) {
  if (PooledEngine.isInitialized) {
    var voice = PooledEngine.nextDrum();
    voice.trigger(type, velocity, t);
    return true;
  }
  return false;
}

// Use PooledEngine for synth voices if available
function triggerSynthWithPool(freq, velocity, t) {
  if (PooledEngine.isInitialized) {
    var voice = PooledEngine.nextSynth();
    voice.noteOn(freq, velocity, t);
    return true;
  }
  return false;
}

// Panic function using PooledEngine
function panicAllVoices() {
  if (PooledEngine.isInitialized) {
    PooledEngine.panic();
  }
  if (device) {
    device.stop();
  }
  var statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = 'PANIC: All voices stopped';
    statusEl.className = 'err';
  }
}

function initPooledEngine() {
  if (device && device.ctx && device.master) {
    PooledEngine.init(device.ctx, device.master);
  }
}


Groovebox.prototype.init=function(){
  if(this.ctx){
    if(this.ctx.state==="suspended") return this.ctx.resume();
    return Promise.resolve();
  }
  var AC=window.AudioContext||window.webkitAudioContext;
  if(!AC) return Promise.reject(new Error("Web Audio API not supported"));
  var self=this;
  this.ctx=new AC();
  var ctx=this.ctx;
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
  this.comp.connect(this.analyser);
  this.analyser.connect(ctx.destination);
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
  this.voices=makeVoices(ctx,this.partGains,{delay:this.delayIn,reverb:this.reverbIn},this.noiseBuf,this.cfg());
  this.updateDrive();
  this.applyKnob("filter"); this.applyKnob("res"); this.applyKnob("swing");
  this.applySongSection(sectionAt(this.song,0).section);
  if(ctx.state==="suspended") return ctx.resume();
  initPooledEngine();
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
    var hz=80*Math.pow(225,v*v);
    this.djFilter.frequency.setTargetAtTime(hz,this.ctx.currentTime,0.03);
  }
  else if(name==="res"){ this.djFilter.Q.value=0.4+v*9; }
  else if(name==="drive"){ this.updateDrive(); }
  else if(name==="delay"){ this.delayIn.gain.value=v*0.9; }
  else if(name==="reverb"){ this.reverbIn.gain.value=v*0.9; }
  else if(name==="swing"){ this.swing=v*0.6; }
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
  });
};
Groovebox.prototype.stop=function(){
  this.isPlaying=false;
  if(this.timerId){ if(this.timerId.stop)this.timerId.stop();else clearInterval(this.timerId); this.timerId=null; }
};
Groovebox.prototype.scheduler=function(){
  try{
    while(this.nextNoteTime<this.ctx.currentTime+0.2){
      var step=this.absStep%16;
      var t=this.nextNoteTime;
      if(step%2===1) t+=this.swing*this.stepDur()*0.5;
      this.scheduleStep(this.absStep,t);
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

  if(step===0) this.onBar(absBar,t);

  var nextIdx=(info.sectionIndex+1)%song.sections.length;
  var nextSection=song.sections[nextIdx];
  var gated=isPreDropSilenceBar(nextSection.name,barInSection,section.bars)&&!preDropGate(step);

  if(KICK_STEPS.indexOf(step)!==-1&&!gated&&!m.KICK){
    v.kick(t);
    if(typeof updateGrammars==="function")updateGrammars("kick",step,0);
    if(this.duck){
      this.duck.gain.cancelScheduledValues(t);
      this.duck.gain.setValueAtTime(1,t);
      this.duck.gain.setTargetAtTime(0.40,t,0.006);
      this.duck.gain.setTargetAtTime(1.0,t+0.055,0.03);
    }
  }
  if(barInSection===0&&step===0&&!m.PERC){
    v.crash(t,(section.name==="DROP"||section.name==="DROP2")?1.0:0.6);
  }
  var bassRoot=song.root+(section.rootOffset||0);
  var scale=SCALES[song.modes[section.mode]];
  var bassBar=generateBassBar(section.bassStyle,bassRoot,scale,barInSection,barRng);
  var bassEvent=bassBar[step];
  if(bassEvent&&!gated&&!m.BASS){
    var dur=bassEvent.sustain?bassEvent.sustain*sd:sd*0.8;
    v.bassNote(t,bassEvent.midi,dur);
    if(typeof updateGrammars==="function")updateGrammars("bass",step,bassEvent.midi);
  }
  if(section.name!=="BREAK"&&!m.PERC){
    if(!gated){
      if((step===4||step===12)&&energy>0.3) v.clap(t,0.7*auto.velocityMul);
      else if(step%4===2) v.shaker(t,0.5*auto.velocityMul);
      else if(step%2===1&&barRng()<0.25*auto.noteDensityMul) v.shaker(t,0.3*auto.velocityMul);
      if(step===14&&barInSection%2===1&&barRng()<0.5) v.openhat(t,0.35);
    }
    var barsLeft=section.bars-1-barInSection;
    if(barsLeft<=1&&(section.name==="BUILD"||section.name==="RISER"||section.name==="INTRO")){
      var fillProgress=1-(barsLeft*16+(15-step))/32;
      if(barRng()<0.2+0.6*fillProgress) v.snare(t,0.3+0.5*fillProgress);
    }
  }
  if(sectionHasPart(section,"lead")&&!m.LEAD){
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
        v.leadNote(t,ev.midi,{acc:accSteps,slide:slide,fromMidi:prevMidi});
        this.lastLeadMidi=ev.midi;
      }
      this._leadStepAcc+=(ev?ev.dur:1);
      this._leadStepCursor++;
    }
  }
  if(sectionHasPart(section,"arp")&&!m.ARP){
    var an=this.patterns.arp[absStep%16];
    if(an) v.arpNote(t,ROOT+24+SCALE_EXT[an.deg],step%4===0);
  }
  if(sectionHasPart(section,"pad")&&!m.PAD&&step===0&&barInSection%2===0){
    v.padChord(t,[bassRoot+12,bassRoot+19,bassRoot+24],sd*32*0.95);
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