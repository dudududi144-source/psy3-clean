




/* ============================================================
   DSP MODULE (session 21 cleanup)
   Contains only the BrickwallLimiter - the one DSP object that is
   actually wired (live master chain, Groovebox.init, session 10).
   PolyBLEP, ZDFFilter, OversampledLowpass and Envelope had ZERO
   callers (verified) and were removed under the wire-or-delete rule;
   their reference implementations remain in git history.
   ============================================================ */





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

// Session 21 cleanup: OversampledLowpass and Envelope (ADSR) removed - zero callers.
// The stray extra closing brace that trailed them is gone as well.

// Phase 2 cleanup: SoftClip removed (only referenced by the dead initSoftClipOutput;
// the drive stage uses its own tanh WaveShaper via updateDrive()).
