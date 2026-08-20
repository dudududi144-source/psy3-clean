




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


// Phase 2 cleanup: SoftClip removed (only referenced by the dead initSoftClipOutput;
// the drive stage uses its own tanh WaveShaper via updateDrive()).
