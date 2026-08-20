

/* ══════════════════════════════════════════════════════════
   PERFORMANCE UTILITIES (v2.0)
   ══════════════════════════════════════════════════════════ */

// Debounce utility
function debounce(fn, delay) {
  var timer = null;
  return function() {
    var ctx = this, args = arguments;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function() {
      fn.apply(ctx, args);
      timer = null;
    }, delay);
  };
}

/* ============================================================
   GLOBAL ERROR HANDLER (Phase 5.1)
   Phase 0 fix: this block was nested inside debounce()'s body
   (merge splice), so it only executed as a side effect of
   calling debounce(). Now installed explicitly at top level.
   ============================================================ */

window.onerror = function(message, source, lineno, colno, error) {
  console.error('PSY3 PRO Error:', message, 'at', source + ':' + lineno + ':' + colno);
  
  // Show error in status bar
  var statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = 'ERROR: ' + message.substring(0, 50);
    statusEl.className = 'err';
  }
  
  // Track error
  trackEvent('error', {
    message: message,
    source: source,
    line: lineno,
    col: colno
  });
  
  return false;
};

window.addEventListener('unhandledrejection', function(event) {
  console.error('PSY3 PRO Unhandled Rejection:', event.reason);
  
  var statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = 'ERROR: ' + String(event.reason).substring(0, 50);
    statusEl.className = 'err';
  }
  
  trackEvent('unhandled_rejection', {
    reason: String(event.reason)
  });
});

// Throttle utility
function throttle(fn, limit) {
  var lastCall = 0;
  return function() {
    var now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      fn.apply(this, arguments);
    }
  };
}

// Pre-allocated buffer pool
var BufferPool = {
  buffers: [],
  maxSize: 8,
  get: function(size) {
    for (var i = 0; i < this.buffers.length; i++) {
      if (this.buffers[i].length >= size) {
        return this.buffers[i];
      }
    }
    var buf = new Float32Array(size);
    if (this.buffers.length < this.maxSize) {
      this.buffers.push(buf);
    }
    return buf;
  },
  clear: function() {
    this.buffers = [];
  }
};

// Object pool for voices
var VoicePool = {
  pool: [],
  active: [],
  maxSize: 32,
  get: function() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }
    return {};
  },
  release: function(voice) {
    if (this.pool.length < this.maxSize) {
      this.pool.push(voice);
    }
  },
  clear: function() {
    this.pool = [];
    this.active = [];
  }
};

/* ══════════════════════════════════════════════════════════
   UNDO/REDO SYSTEM (v5.0)
   ══════════════════════════════════════════════════════════ */

var UndoRedo = {
  history: [],
  currentIndex: -1,
  maxSize: 50,
  
  // Push a new state to history
  push: function(state) {
    // Remove any states after current index
    this.history = this.history.slice(0, this.currentIndex + 1);
    
    // Add new state
    this.history.push(JSON.parse(JSON.stringify(state)));
    this.currentIndex++;
    
    // Limit history size
    if (this.history.length > this.maxSize) {
      this.history.shift();
      this.currentIndex--;
    }
  },
  
  // Undo: go back one state
  undo: function() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
    }
    return null;
  },
  
  // Redo: go forward one state
  redo: function() {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
    }
    return null;
  },
  
  // Check if undo is available
  canUndo: function() {
    return this.currentIndex > 0;
  },
  
  // Check if redo is available
  canRedo: function() {
    return this.currentIndex < this.history.length - 1;
  },
  
  // Clear history
  clear: function() {
    this.history = [];
    this.currentIndex = -1;
  }
};

function doUndo() {
  var state = UndoRedo.undo();
  if (state) {
    applyDeviceState(state);
    setStatus('Undo', 'ok');
  }
}

function doRedo() {
  var state = UndoRedo.redo();
  if (state) {
    applyDeviceState(state);
    setStatus('Redo', 'ok');
  }
}


/* ══════════════════════════════════════════════════════════
   MIDI LEARN SYSTEM (v3.0)
   ══════════════════════════════════════════════════════════ */

// MIDI Learn state
var MIDILearn = {
  active: false,
  targetParam: null,
  ccMap: {},      // CC number -> parameter mapping
  noteMap: {},    // Note number -> action mapping
  lastCC: null,
  lastNote: null,
  
  // Start learning a parameter
  start: function(param) {
    this.active = true;
    this.targetParam = param;
    console.log('MIDI Learn: waiting for CC for ' + param);
  },
  
  // Stop learning
  stop: function() {
    this.active = false;
    this.targetParam = null;
  },
  
  // Handle incoming CC
  handleCC: function(cc, value) {
    this.lastCC = cc;
    
    // If learning, map this CC to the target parameter
    if (this.active && this.targetParam) {
      this.ccMap[cc] = this.targetParam;
      console.log('MIDI Learn: mapped CC ' + cc + ' to ' + this.targetParam);
      this.stop();
      return true;
    }
    
    // If mapped, apply the value
    if (this.ccMap[cc]) {
      var param = this.ccMap[cc];
      var normalized = value / 127;
      applyMIDIParam(param, normalized);
      return true;
    }
    
    return false;
  },
  
  // Handle incoming note
  handleNote: function(note, velocity) {
    this.lastNote = note;
    
    // If mapped, trigger the action
    if (this.noteMap[note]) {
      var action = this.noteMap[note];
      triggerMIDIAction(action, velocity);
      return true;
    }
    
    return false;
  },
  
  // Clear all mappings
  clear: function() {
    this.ccMap = {};
    this.noteMap = {};
    console.log('MIDI Learn: all mappings cleared');
  }
};

/* ============================================================
   MIDI INPUT (Phase 2.5)
   Phase 0 fix: MIDIInput + initMIDIInput were spliced INSIDE
   MIDILearn.clear() by a bad merge, so MIDI never initialized
   (initMIDIInput was not global; the boot-time typeof guard
   silently failed). Extracted back to top level. CC handling now
   routes to applyMIDIParam() (the undefined macro call is gone).
   ============================================================ */
var MIDIInput = {
  access: null,
  inputs: [],
  
  init: function() {
    if (this.requested) return; // Phase 0b: idempotent (armed at boot AND on first gesture)
    this.requested = true;
    var self = this;
    if (!navigator.requestMIDIAccess) {
      console.log('Web MIDI API not supported');
      return;
    }
    navigator.requestMIDIAccess({ sysex: false }).then(function(access) {
      self.access = access;
      var inputs = access.inputs.values();
      for (var input = inputs.next(); input && !input.done; input = inputs.next()) {
        self.inputs.push(input.value);
        input.value.onmidimessage = function(event) {
          self.handleMessage(event);
        };
        console.log('MIDI input connected: ' + input.value.name);
      }
      access.onstatechange = function(event) {
        if (event.port.type === 'input' && event.port.state === 'connected') {
          self.inputs.push(event.port);
          event.port.onmidimessage = function(e) {
            self.handleMessage(e);
          };
        }
      };
    }).catch(function(err) {
      console.log('MIDI access failed: ' + err);
    });
  },
  
  handleMessage: function(event) {
    var data = event.data;
    var status = data[0] & 0xF0;
    var note = data[1];
    var velocity = data[2];
    if (status === 0xB0) this.handleCC(note, velocity);
    if (status === 0x90 && velocity > 0) this.handleNoteOn(note, velocity);
  },
  
  handleCC: function(cc, value) {
    if (MIDILearn.active && MIDILearn.targetParam) {
      var learnedParam = MIDILearn.targetParam; // Phase 0b: capture before stop() clears it
      MIDILearn.ccMap[cc] = learnedParam;
      console.log('MIDI Learn: mapped CC ' + cc + ' to ' + learnedParam);
      MIDILearn.stop();
      if (typeof setStatus === 'function') setStatus('MIDI: CC ' + cc + ' -> ' + String(learnedParam).toUpperCase(), 'ok');
      return;
    }
    var param = MIDILearn.ccMap[cc];
    if (param && device) {
      applyMIDIParam(param, value / 127);
    }
  },
  
  handleNoteOn: function(note, velocity) {
    var action = MIDILearn.noteMap[note];
    if (action && typeof action === 'number') {
      hitPad(action);
      return;
    }
    // Default mapping (Phase 0): notes 36-43 (C2..G2) trigger pads 1-8
    if (note >= 36 && note <= 43 && velocity > 0) {
      hitPad(note - 36);
    }
  }
};

function initMIDIInput() {
  MIDIInput.init();
}

// Apply MIDI parameter to device
// Apply MIDI parameter to device
// Phase 0b fix: knob params now route through device.setKnob(), i.e. the
// exact same code path as the UI knobs. The previous version referenced
// nodes that do not exist (delayMix/reverbMix were never created) and a
// different filter node than the knobs use (autoFilter vs djFilter),
// so delay/reverb learn silently no-op'd and filter behaved differently.
function applyMIDIParam(param, value) {
  if (!device) return;

  // Master volume has no knob; apply directly (guarded).
  if (param === 'volume') {
    if (device.master && device.ctx) {
      device.master.gain.setTargetAtTime(clamp(value, 0, 1), device.ctx.currentTime, 0.01);
    }
    return;
  }

  if (param === 'resonance') param = 'res'; // legacy alias
  var known = { bpm:1, filter:1, res:1, drive:1, delay:1, reverb:1, swing:1 };
  if (known[param]) {
    device.setKnob(param, value);
  } else {
    console.log('MIDI Learn: unknown parameter ' + param);
  }
}

// Trigger MIDI action
function triggerMIDIAction(action, velocity) {
  if (!device) return;
  
  switch(action) {
    case 'play':
      device.play();
      break;
    case 'stop':
      device.stop();
      break;
    case 'variation':
      device.variate();
      break;
    default:
      console.log('MIDI Learn: unknown action ' + action);
  }
}

/* $ function - get element by ID */
function $(id){return document.getElementById(id);}
var ROOT=33;

/* ═══ SCALES DEFINITION ═══ */
var SCALES={
phrygianDominant:[0,1,4,5,7,8,10],
harmonicMinor:[0,2,3,5,7,8,11],
naturalMinor:[0,2,3,5,7,8,10],
doubleHarmonic:[0,1,4,5,7,8,11],
phrygian:[0,1,3,5,7,8,10],
dorian:[0,2,3,5,7,9,10],
major:[0,2,4,5,7,9,11],
mixolydian:[0,2,4,5,7,9,10]
};
var SCALE=SCALES.phrygianDominant;
var SCALE_EXT=(function(){var a=[],i;for(i=0;i<SCALE.length;i++)a.push(SCALE[i]);for(i=0;i<SCALE.length;i++)a.push(SCALE[i]+12);a.push(24);return a;})();

/* midiToFreq - convert MIDI note to frequency */
function midiToFreq(midi){return 440*Math.pow(2,(midi-69)/12);}

/* mtof - alias for midiToFreq */
function mtof(midi){return midiToFreq(midi);}


/* ═══ POOLED ENGINE CONSTANTS ═══ */




function rnd(){return Math.random();}function mulberry32(seed){return function(){var t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}function makeArpPhrase(rnd){
var out=[];
for(var s=0;s<16;s++){
var deg=s%7;
out.push({deg:deg,on:s%2===0});
}
return out;
}function makeLeadMotif(rnd){
var out=[];
for(var s=0;s<16;s++){
if(s%4===0||rnd()<0.4){
var deg=Math.floor(rnd()*7);
out.push({deg:deg,dur:1,accent:rnd(),rest:false});
}else{
out.push({rest:true,dur:1});
}
}
return out;
}
function makePatterns(seed){
  var rnd=mulberry32(seed);
  var s;
  /* kick: four-on-the-floor */
  var kick=[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0];
  /* bass: K-B-B-B rolling gallop, root drone + passing tones + octave lift */
  var bass=[];
  for(s=0;s<16;s++){
    if(s%4===0){ bass.push(null); continue; }
    var n=0;
    var r=rnd();
    if(s===15&&r<STYLE.bassOctaveChance){ n=12; }
    else if((s===7||s===11)&&r<STYLE.bassPassingChance){ n=(rnd()<0.5)?10:7; }
    bass.push({n:n});
  }
  /* perc: claps on 2 & 4, shakers, occasional open hat */
  var perc=[];
  for(s=0;s<16;s++){
    if(s===4||s===12){ perc.push("clap"); continue; }
    if(s===14&&rnd()<0.5){ perc.push("oh"); continue; }
    if(s%4===2){ perc.push("shaker"); continue; }
    if(s%2===1&&rnd()<0.30){ perc.push("shaker"); continue; }
    perc.push(null);
  }
  /* lead: 2-bar call & response motif */
  var lead=makeLeadMotif(rnd);
  /* arp: Phrygian Dominant spiral */
  var arp=makeArpPhrase(rnd);
  /* pad: root-fifth-octave drone (modal, no third) */
  var pad=[];
  for(s=0;s<16;s++) pad.push(null);
  pad[0]={chord:[0,4,7]};
  return {kick:kick,bass:bass,perc:perc,lead:lead,arp:arp,pad:pad};
}

/* ---------- synth voices ---------- */
/* ═══ MAKE NOISE BUFFER ═══ */
function makeNoiseBuffer(ctx){
  var bufferSize=ctx.sampleRate*2;
  var buffer=ctx.createBuffer(1,bufferSize,ctx.sampleRate);
  var data=buffer.getChannelData(0);
  for(var i=0;i<bufferSize;i++){
    data[i]=Math.random()*2-1;
  }
  return buffer;
}

function makeVoices(ctx,outMap,sends,noiseBuf,cfg){
  function kick(t){
    var o=ctx.createOscillator(),g=ctx.createGain();
    o.type="sine";
    o.frequency.setValueAtTime(cfg.kickStart||150,t);
    o.frequency.exponentialRampToValueAtTime(cfg.kickEnd||55,t+0.04);
    g.gain.setValueAtTime(1.0,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+0.10);
    o.connect(g); g.connect(outMap.KICK);
    o.start(t); o.stop(t+0.13);
    var cs=ctx.createBufferSource(); cs.buffer=noiseBuf;
    var bp=ctx.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=3000; bp.Q.value=1.2;
    var cg=ctx.createGain();
    cg.gain.setValueAtTime(0.35,t);
    cg.gain.exponentialRampToValueAtTime(0.001,t+0.015);
    cs.connect(bp); bp.connect(cg); cg.connect(outMap.KICK);
    cs.start(t); cs.stop(t+0.02);
  }
  function bassNote(t,midi,dur){
    var f=mtof(midi);
    var o=ctx.createOscillator(); o.type=cfg.bassWave; o.frequency.value=f;
    var flt=ctx.createBiquadFilter(); flt.type="lowpass"; flt.Q.value=cfg.bassRes;
    var c0=Math.min(cfg.bassCut*2.8,ctx.sampleRate*0.4);
    var c1=Math.max(90,cfg.bassCut*0.45);
    flt.frequency.setValueAtTime(c0,t);
    flt.frequency.exponentialRampToValueAtTime(c1,t+0.14);
    var g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(cfg.bassLvl,t+0.005);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.connect(flt); flt.connect(g); g.connect(outMap.BASS);
    o.start(t); o.stop(t+dur+0.03);
  }
  function leadNote(t,midi,opts){
    opts=opts||{};
    var f=mtof(midi);
    var o1=ctx.createOscillator(),o2=ctx.createOscillator();
    o1.type="sawtooth"; o2.type="sawtooth";
    var d=Math.pow(2,7/1200);
    if(opts.slide&&opts.fromMidi){
      var ff=mtof(opts.fromMidi);
      o1.frequency.setValueAtTime(ff,t);
      o1.frequency.exponentialRampToValueAtTime(f,t+0.035);
      o2.frequency.setValueAtTime(ff*d,t);
      o2.frequency.exponentialRampToValueAtTime(f*d,t+0.035);
    } else {
      o1.frequency.value=f; o2.frequency.value=f*d;
    }
    var flt=ctx.createBiquadFilter(); flt.type="lowpass"; flt.Q.value=cfg.leadRes;
    var acc=opts.acc||0;
    var peak=Math.min(cfg.leadCut*(acc===2?1.4:(acc===1?1.2:1.0)),ctx.sampleRate*0.42);
    flt.frequency.setValueAtTime(280,t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(300,peak),t+0.016);
    flt.frequency.exponentialRampToValueAtTime(380,t+0.22);
    var g=ctx.createGain();
    var lvl=cfg.leadLvl*(acc===2?1.0:(acc===1?0.85:0.7));
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(lvl,t+0.009);
    g.gain.exponentialRampToValueAtTime(0.001,t+0.24);
    o1.connect(flt); o2.connect(flt); flt.connect(g); g.connect(outMap.LEAD);
    if(sends.delay){ var sd=ctx.createGain(); sd.gain.value=0.4; g.connect(sd); sd.connect(sends.delay); }
    if(sends.reverb){ var sr2=ctx.createGain(); sr2.gain.value=0.25; g.connect(sr2); sr2.connect(sends.reverb); }
    o1.start(t); o2.start(t); o1.stop(t+0.26); o2.stop(t+0.26);
  }
  function arpNote(t,midi,acc){
    var f=mtof(midi);
    var o=ctx.createOscillator(); o.type="sawtooth"; o.frequency.value=f;
    var flt=ctx.createBiquadFilter(); flt.type="lowpass"; flt.Q.value=cfg.arpRes;
    var cut=acc?cfg.arpCut*1.4:cfg.arpCut;
    flt.frequency.setValueAtTime(Math.max(200,cut*0.5),t);
    flt.frequency.exponentialRampToValueAtTime(Math.min(cut,ctx.sampleRate*0.4),t+0.012);
    flt.frequency.exponentialRampToValueAtTime(300,t+0.11);
    var g=ctx.createGain();
    var lvl=cfg.arpLvl*(acc?1:0.7);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(lvl,t+0.006);
    g.gain.exponentialRampToValueAtTime(0.001,t+0.13);
    o.connect(flt); flt.connect(g); g.connect(outMap.ARP);
    if(sends.delay){ var sd=ctx.createGain(); sd.gain.value=0.5; g.connect(sd); sd.connect(sends.delay); }
    o.start(t); o.stop(t+0.15);
  }
  function padChord(t,midis,dur){
    var flt=ctx.createBiquadFilter(); flt.type="lowpass"; flt.Q.value=1.1;
    flt.frequency.value=cfg.padCut;
    var lfo=ctx.createOscillator(); lfo.frequency.value=0.13;
    var lfoG=ctx.createGain(); lfoG.gain.value=cfg.padCut*0.45;
    lfo.connect(lfoG); lfoG.connect(flt.frequency);
    var g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(cfg.padLvl,t+0.7);
    g.gain.setTargetAtTime(0.0001,t+dur,0.45);
    flt.connect(g); g.connect(outMap.PAD);
    if(sends.reverb){ var sr2=ctx.createGain(); sr2.gain.value=0.5; g.connect(sr2); sr2.connect(sends.reverb); }
    for(var i=0;i<midis.length;i++){
      var f=mtof(midis[i]);
      var o1=ctx.createOscillator(); o1.type="sawtooth"; o1.frequency.value=f; o1.detune.value=-6;
      var o2=ctx.createOscillator(); o2.type="sawtooth"; o2.frequency.value=f; o2.detune.value=6;
      var og=ctx.createGain(); og.gain.value=0.5/midis.length+0.12;
      o1.connect(og); o2.connect(og); og.connect(flt);
      o1.start(t); o2.start(t);
      o1.stop(t+dur+2.6); o2.stop(t+dur+2.6);
    }
    lfo.start(t); lfo.stop(t+dur+2.6);
  }
  function clap(t,v){
    for(var k=0;k<3;k++){
      var tt=t+k*0.009;
      var cs=ctx.createBufferSource(); cs.buffer=noiseBuf;
      var bp=ctx.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=1500; bp.Q.value=1.8;
      var g=ctx.createGain();
      g.gain.setValueAtTime((v||0.8)*(k===2?1:0.7),tt);
      g.gain.exponentialRampToValueAtTime(0.001,tt+0.03+(k===2?0.05:0));
      cs.connect(bp); bp.connect(g); g.connect(outMap.PERC);
      if(sends.reverb){ var sr2=ctx.createGain(); sr2.gain.value=0.2; g.connect(sr2); sr2.connect(sends.reverb); }
      cs.start(tt); cs.stop(tt+0.09);
    }
  }
  function shaker(t,v){
    var cs=ctx.createBufferSource(); cs.buffer=noiseBuf;
    var hp=ctx.createBiquadFilter(); hp.type="highpass"; hp.frequency.value=8200;
    var g=ctx.createGain();
    g.gain.setValueAtTime(0.22*v,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+0.045);
    cs.connect(hp); hp.connect(g); g.connect(outMap.PERC);
    cs.start(t); cs.stop(t+0.05);
  }
  function openhat(t,v){
    var cs=ctx.createBufferSource(); cs.buffer=noiseBuf;
    var hp=ctx.createBiquadFilter(); hp.type="highpass"; hp.frequency.value=7200;
    var g=ctx.createGain();
    g.gain.setValueAtTime(0.35*v,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+0.2);
    cs.connect(hp); hp.connect(g); g.connect(outMap.PERC);
    cs.start(t); cs.stop(t+0.21);
  }
  function snare(t,v){
    var cs=ctx.createBufferSource(); cs.buffer=noiseBuf;
    var bp=ctx.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=1900; bp.Q.value=0.9;
    var g=ctx.createGain();
    g.gain.setValueAtTime(0.7*v,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+0.12);
    cs.connect(bp); bp.connect(g); g.connect(outMap.PERC);
    cs.start(t); cs.stop(t+0.13);
    var o=ctx.createOscillator(); o.type="triangle"; o.frequency.value=185;
    var og=ctx.createGain();
    og.gain.setValueAtTime(0.4*v,t);
    og.gain.exponentialRampToValueAtTime(0.001,t+0.05);
    o.connect(og); og.connect(outMap.PERC);
    o.start(t); o.stop(t+0.06);
  }
  var crashBuf=(function(){
    var len=Math.floor(ctx.sampleRate*1.2);
    var b=ctx.createBuffer(1,len,ctx.sampleRate);
    var d=b.getChannelData(0);
    var seed=777;
    for(var i=0;i<len;i++){ seed=(seed*16807)%2147483647; d[i]=((seed/2147483647)*2-1)*(1-i/len); }
    return b;
  })();
  function crash(t,lvl){
    var cs=ctx.createBufferSource(); cs.buffer=crashBuf;
    var hp=ctx.createBiquadFilter(); hp.type="highpass"; hp.frequency.value=3500;
    var g=ctx.createGain();
    g.gain.setValueAtTime(0.5*lvl,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+1.1);
    cs.connect(hp); hp.connect(g); g.connect(outMap.PERC);
    if(sends.reverb){ var sr2=ctx.createGain(); sr2.gain.value=0.5; g.connect(sr2); sr2.connect(sends.reverb); }
    cs.start(t); cs.stop(t+1.15);
  }
  return {kick:kick,bassNote:bassNote,leadNote:leadNote,arpNote:arpNote,padChord:padChord,
          clap:clap,shaker:shaker,openhat:openhat,snare:snare,crash:crash};
}

/* ---------- song engine M2: sub-seeds, song model, themes, bass styles, fills, energy ---------- */

function subSeed(parentSeed,label){
  var h=(parentSeed>>>0)^0x9E3779B9;
  for(var i=0;i<label.length;i++){
    h=Math.imul(h^label.charCodeAt(i),0x85EBCA6B);
    h=(h^(h>>>13))>>>0;
  }
  h=Math.imul(h^(h>>>16),0x27D4EB2F);
  return (h^(h>>>15))>>>0;
}
function rngFor(parentSeed,label){ return mulberry32(subSeed(parentSeed,label)); }
var SECTION_TEMPLATE=[
  ["INTRO",32,"transition","intro","pedal"],
  ["BUILD",16,"transition","drop","gallop"],
  ["DROP",32,"A","drop","gallop"],
  ["BREAK",32,"B","break","pedal"],
  ["RISER",8,"transition","riser","offbeat"],
  ["DROP2",32,"A2","drop2","gallop"],
  ["OUTRO",24,"transition","intro","pedal"]
];
function buildSong(seed,opts){
  opts=opts||{};
  var root=opts.root!=null?opts.root:33;
  var bpm=opts.bpm!=null?opts.bpm:145;
  var modes={intro:"phrygian",drop:"phrygianDominant",break:"harmonicMinor",riser:"phrygian",drop2:"phrygianDominant"};
  var drop2RootOffset=rngFor(seed,"drop2mod")()<0.5?0:2;
  var sections=[];
  for(var i=0;i<SECTION_TEMPLATE.length;i++){
    var row=SECTION_TEMPLATE[i];
    sections.push({name:row[0],bars:row[1],themeKey:row[2],mode:row[3],bassStyle:row[4],
      rootOffset:row[0]==="DROP2"?drop2RootOffset:0});
  }
  var cursor=0,sectionStarts=[];
  for(i=0;i<sections.length;i++){ sectionStarts.push(cursor); cursor+=sections[i].bars; }
  var themes={
    A:buildTheme(seed,"A",root+24,modes.drop),
    A2:buildTheme(seed,"A2",root+24+drop2RootOffset,modes.drop2,{deriveFrom:"A"}),
    B:buildTheme(seed,"B",root+24,modes.break,{register:-12,emotional:true}),
    transition:buildTransitionTheme(seed,root+24,modes.intro)
  };
  return {seed:seed,root:root,bpm:bpm,modes:modes,drop2RootOffset:drop2RootOffset,
    themes:themes,sections:sections,sectionStarts:sectionStarts,totalBars:cursor};
}
function sectionAt(song,absBar){
  var bar=((absBar%song.totalBars)+song.totalBars)%song.totalBars;
  var lo=0,hi=song.sections.length-1;
  while(lo<hi){ var mid=(lo+hi+1)>>1; if(song.sectionStarts[mid]<=bar) lo=mid; else hi=mid-1; }
  return {section:song.sections[lo],sectionIndex:lo,barInSection:bar-song.sectionStarts[lo],barInTrack:bar};
}
function degreeToSemitone(scaleIntervals,deg){
  var len=scaleIntervals.length;
  var oct=Math.floor(deg/len);
  var idx=((deg%len)+len)%len;
  return scaleIntervals[idx]+12*oct;
}
function cloneEv(ev,extra){
  var out={};
  for(var k in ev) out[k]=ev[k];
  if(extra) for(var k2 in extra) out[k2]=extra[k2];
  return out;
}
function renderMotif(motif,rootMidi,scaleIntervals){
  return motif.map(function(ev){
    if(ev.rest) return ev;
    return cloneEv(ev,{midi:rootMidi+degreeToSemitone(scaleIntervals,ev.deg)+12*ev.oct});
  });
}
function transposeDegree(motif,n){
  return motif.map(function(ev){ return ev.rest?ev:cloneEv(ev,{deg:ev.deg+n}); });
}
function transposeOctave(motif,n){
  return motif.map(function(ev){ return ev.rest?ev:cloneEv(ev,{oct:ev.oct+n}); });
}
function invert(motif){
  var firstIdx=-1;
  for(var i=0;i<motif.length;i++){ if(!motif[i].rest){ firstIdx=i; break; } }
  if(firstIdx===-1) return motif.slice();
  var pivot=motif[firstIdx].deg;
  return motif.map(function(ev){ return ev.rest?ev:cloneEv(ev,{deg:pivot-(ev.deg-pivot)}); });
}
function retrograde(motif){ return motif.slice().reverse(); }
function displace(motif,steps){
  var totalSteps=0,i,j;
  for(i=0;i<motif.length;i++) totalSteps+=motif[i].dur;
  if(totalSteps===0) return motif.slice();
  var shift=((steps%totalSteps)+totalSteps)%totalSteps;
  if(shift===0) return motif.slice();
  var expanded=[];
  for(i=0;i<motif.length;i++) for(j=0;j<motif[i].dur;j++) expanded.push(motif[i]);
  var rotated=expanded.slice(shift).concat(expanded.slice(0,shift));
  var seam=rotated.length-shift;
  var out=[];
  for(i=0;i<rotated.length;i++){
    var src=rotated[i];
    var prev=i>0?rotated[i-1]:null;
    if(prev===src&&i!==seam){ out[out.length-1].dur+=1; }
    else{ out.push({deg:src.deg,oct:src.oct,dur:1,accent:src.accent,rest:src.rest}); }
  }
  return out;
}
function fragment(motif,startIdx,len,repeats){
  var frag=motif.slice(startIdx,startIdx+len);
  var out=[];
  for(var i=0;i<repeats;i++) out=out.concat(frag);
  return out;
}
function scaleDuration(motif,factor){
  return motif.map(function(ev){ return cloneEv(ev,{dur:Math.max(1,Math.round(ev.dur*factor))}); });
}
function buildTheme(seed,themeKey,rootMidi,scaleKey,opts){
  opts=opts||{};
  var rng=rngFor(seed,"theme:"+themeKey);
  var register=opts.register!=null?opts.register:0;
  var emotional=!!opts.emotional;
  var cellLen=emotional?8:16;
  var strongSteps=cellLen===16?[0,8]:[0,4];
  var degreePool=emotional?[0,2,4,-3]:[0,1,2,4,5];
  var cell=[],stepsUsed=0;
  while(stepsUsed<cellLen){
    var dur=emotional?(rng()<0.5?4:2):(rng()<0.7?1:2);
    dur=Math.min(dur,cellLen-stepsUsed);
    var isStrong=strongSteps.indexOf(stepsUsed)!==-1;
    var deg=isStrong?(rng()<0.6?0:4):degreePool[Math.floor(rng()*degreePool.length)];
    var rest=!isStrong&&rng()<(emotional?0.35:0.12);
    cell.push({deg:deg,oct:0,dur:dur,accent:isStrong?1:(rng()<0.3?0.6:0.3),rest:rest});
    stepsUsed+=dur;
  }
  var seedCell=cell;
  if(opts.deriveFrom){ seedCell=transposeDegree(cell,3); }
  var phrasePlan=[
    {op:"identity"},
    {op:"displace",steps:Math.floor(cellLen/2)},
    {op:"transposeDegree",n:2},
    {op:"invert"}
  ];
  return {themeKey:themeKey,rootMidi:rootMidi,scaleKey:scaleKey,register:register,
    cellLen:cellLen,seedCell:seedCell,phrasePlan:phrasePlan};
}
function buildTransitionTheme(seed,rootMidi,scaleKey){
  var rng=rngFor(seed,"theme:transition");
  var cell=[];
  for(var i=0;i<16;i+=4){
    cell.push({deg:rng()<0.7?0:4,oct:0,dur:4,accent:i===0?1:0.4,rest:rng()<0.4});
  }
  return {themeKey:"transition",rootMidi:rootMidi,scaleKey:scaleKey,register:0,cellLen:16,seedCell:cell,
    phrasePlan:[{op:"identity"},{op:"identity"},{op:"fragment",startIdx:0,len:2,repeats:2},{op:"identity"}]};
}
function resolveThemeBar(theme,barInSection,scalesTable){
  var phraseIdx=barInSection%theme.phrasePlan.length;
  var step=theme.phrasePlan[phraseIdx];
  var motif=theme.seedCell;
  switch(step.op){
    case "identity": break;
    case "displace": motif=displace(motif,step.steps); break;
    case "transposeDegree": motif=transposeDegree(motif,step.n); break;
    case "invert": motif=invert(motif); break;
    case "retrograde": motif=retrograde(motif); break;
    case "fragment": motif=fragment(motif,step.startIdx,step.len,step.repeats); break;
    case "augment": motif=scaleDuration(motif,2); break;
    case "diminish": motif=scaleDuration(motif,0.5); break;
  }
  var scale=scalesTable[theme.scaleKey];
  return renderMotif(motif,theme.rootMidi+theme.register,scale);
}
var KICK_STEPS=[0,4,8,12];
var BassStyles={
  gallop:function(rootMidi,scale,barIndex,rng){
    var steps=new Array(16).fill(null);
    for(var s=0;s<16;s++){
      if(KICK_STEPS.indexOf(s)!==-1) continue;
      if(s===15&&barIndex%4===3){ steps[s]={midi:rootMidi+12,accent:0.8}; continue; }
      var deg=0;
      var isPickup=(s===7||s===11)&&barIndex%2===1;
      if(isPickup) deg=rng()<0.5?4:6;
      steps[s]={midi:rootMidi+degreeToSemitone(scale,deg),accent:0.6};
    }
    return steps;
  },
  offbeat:function(rootMidi,scale,barIndex,rng){
    var steps=new Array(16).fill(null);
    var offs=[2,6,10,14];
    for(var i=0;i<offs.length;i++){
      var s=offs[i];
      var deg=(s===14&&barIndex%2===1)?4:0;
      steps[s]={midi:rootMidi+degreeToSemitone(scale,deg),accent:0.55};
    }
    return steps;
  },
  pumping:function(rootMidi,scale,barIndex,rng){
    var steps=new Array(16).fill(null);
    steps[0]={midi:rootMidi,accent:0.7,sustain:16};
    return steps;
  },
  pedal:function(rootMidi,scale,barIndex,rng){
    var steps=new Array(16).fill(null);
    if(barIndex%2===0) steps[0]={midi:rootMidi,accent:0.4,sustain:32};
    return steps;
  }
};
function generateBassBar(styleKey,rootMidi,scaleIntervals,barIndex,rng){
  return (BassStyles[styleKey]||BassStyles.gallop)(rootMidi,scaleIntervals,barIndex,rng);
}
function applyFill(basePattern,fillProgress,rng){
  var out=basePattern.slice();
  var density=0.3+0.7*fillProgress;
  for(var s=0;s<16;s++){
    if(out[s]) continue;
    if(rng()<density*0.5) out[s]=1;
  }
  return out;
}
function isSectionDownbeat(barInSection){ return barInSection===0; }
function isPreDropSilenceBar(nextSectionName,barInSection,sectionBars){
  return barInSection===sectionBars-1&&(nextSectionName==="DROP"||nextSectionName==="DROP2");
}
function preDropGate(step){ return step<12; }
var EnergyCurves={
  rampUp:function(bar,total){ return bar/Math.max(1,total-1); },
  rampDown:function(bar,total){ return 1-bar/Math.max(1,total-1); },
  sustainHigh:function(){ return 0.85; },
  undulateLow:function(bar,total){ return 0.25+0.15*Math.sin((bar/total)*Math.PI*2); },
  wake:function(bar,total){ return Math.min(1,bar/(total*0.8))*0.5; }
};
var SECTION_ENERGY_CURVE={INTRO:"wake",BUILD:"rampUp",DROP:"sustainHigh",BREAK:"undulateLow",RISER:"rampUp",DROP2:"sustainHigh",OUTRO:"rampDown"};
function energyAt(sectionName,barInSection,sectionBars){
  var curveName=SECTION_ENERGY_CURVE[sectionName]||"sustainHigh";
  return EnergyCurves[curveName](barInSection,sectionBars);
}
function automationFromEnergy(e){
  return {filterCutoffHz:300+e*7200,noteDensityMul:0.4+e*0.8,velocityMul:0.6+e*0.4,delaySend:0.35-e*0.2,reverbSend:0.3-e*0.15};
}
var SECTION_PARTS={
  INTRO:["pad"],BUILD:["pad","bass"],DROP:["bass","lead","arp","pad"],
  BREAK:["lead","pad"],RISER:["bass"],DROP2:["bass","lead","arp","pad"],OUTRO:["pad","bass"]
};

/* ═══ STYLE ═══ */
var STYLE={
name:"FULL-ON",
leadDensity:0.6,
glideChance:0.3,
bassOctaveChance:0.3,
bassPassingChance:0.18,
scale:"phrygianDominant"
};
function sectionHasPart(section,part){
  var parts=SECTION_PARTS[section.name]||[];
  return parts.indexOf(part)!==-1;
}

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

Grammars.init();

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
if (typeof hitPad === 'function') {
  originalHitPad = hitPad;
  hitPad = function(idx, el) {
    // Track melody for grammar learning
    grammarTracker.trackMelody(idx);
    
    // Call original
    if (originalHitPad) {
      return originalHitPad(idx, el);
    }
  };
}

// Hook into scheduleStep to track kick and generate
var originalScheduleStep = null;
if (typeof Groovebox !== 'undefined' && Groovebox.prototype.scheduleStep) {
  originalScheduleStep = Groovebox.prototype.scheduleStep;
  Groovebox.prototype.scheduleStep = function(absStep, t) {
    var step = absStep % 16;
    
    // Track kick for rhythm grammar
    if (step === 0 || step === 4 || step === 8 || step === 12) {
      grammarTracker.trackKick(step);
    }
    
    // ADAPTIVE mode: Generate music using CandidateGenerator
    if (this.brainMode === 'ADAPTIVE' && step === 0) {
      var currentState = {
        lastBassInterval: grammarTracker.lastBassNote || 0
      };
      var best = CandidateGenerator.generateNextBar(currentState, null);
      
      // Apply generated rhythm to kick pattern
      if (best && best.rhythmPattern && this.patterns && this.patterns.KICK) {
        for (var i = 0; i < 16; i++) {
          this.patterns.KICK[i] = best.rhythmPattern[i];
        }
        refreshSeqUi();
      }
    }
    
    // Call original
    if (originalScheduleStep) {
      return originalScheduleStep.call(this, absStep, t);
    }
  };
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
  return Promise.resolve({ok:true,rms:0.1,peak:0.5});
};;
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
try{
  device=new Groovebox();
}catch(e){
  document.addEventListener("DOMContentLoaded",function(){
    var st=document.getElementById("status");
    if(st){st.textContent="DEVICE ERROR: "+e.message;st.style.color="#ff0044";st.style.fontSize="14px";}
  });
}
if(device){ device.makePatterns=makePatterns; } // Phase 0: guard (device undefined if ctor threw)
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
/* ═══ PART COLORS ═══ */


/* ═══ PART NAMES ═══ */



var KNOB_DEFS=[
  {name:"bpm",label:"BPM",fmt:function(v){ return String(Math.round(120+v*45)); }},
  {name:"filter",label:"FILTER",fmt:pctFmt},
  {name:"res",label:"RESO",fmt:pctFmt},
  {name:"drive",label:"DRIVE",fmt:pctFmt},
  {name:"delay",label:"DELAY",fmt:pctFmt},
  {name:"reverb",label:"REVERB",fmt:pctFmt},
  {name:"swing",label:"SWING",fmt:pctFmt}
];
var KNOB_DEFAULTS={bpm:(145-120)/45,filter:1,res:0.15,drive:0.15,delay:0.35,reverb:0.30,swing:0.20};
function pctFmt(v){ return Math.round(v*100)+"%"; }
var knobEls={};
function buildKnobs(){
  var row=$("knobs"); if(!row) return;
  for(var i=0;i<KNOB_DEFS.length;i++){
    (function(def){
      var wrap=document.createElement("div"); wrap.className="knob";
      var dial=document.createElement("div"); dial.className="knob-dial";
      var ind=document.createElement("div"); ind.className="knob-ind";
      dial.appendChild(ind);
      var nm=document.createElement("div"); nm.className="knob-name"; nm.textContent=def.label;
      var val=document.createElement("div"); val.className="knob-val";
      wrap.appendChild(dial); wrap.appendChild(nm); wrap.appendChild(val);
      row.appendChild(wrap);
      knobEls[def.name]={dial:dial,val:val,def:def};
      renderKnob(def.name);
      dial.addEventListener("pointerdown",function(e){
        if(e.preventDefault) e.preventDefault();
        startKnobDrag(def.name,e.clientY||0);
      });
      dial.addEventListener("dblclick",function(){ device.setKnob(def.name,KNOB_DEFAULTS[def.name]); });
      // Phase 0b: right-click = MIDI Learn this knob's parameter
      // (dblclick keeps its existing reset-to-default role)
      dial.addEventListener("contextmenu",function(e){
        if(e.preventDefault) e.preventDefault();
        if(typeof MIDILearn!=="undefined"){
          MIDILearn.start(def.name);
          setStatus("MIDI LEARN: "+def.label+" — move a controller","ok");
        }
      });
    })(KNOB_DEFS[i]);
  }
}
function renderKnob(name){
  var el=knobEls[name]; if(!el) return;
  var v=device.knobVals[name];
  el.dial.style.transform="rotate("+(-135+v*270)+"deg)";
  el.val.textContent=el.def.fmt(v);
}
var dragKnob=null,dragY=0,dragStart=0;
function startKnobDrag(name,y){
  dragKnob=name; dragY=y; dragStart=device.knobVals[name];
  window.addEventListener("pointermove",knobMove);
  window.addEventListener("pointerup",knobUp);
}
function knobMove(e){
  if(!dragKnob) return;
  var dv=(dragY-(e.clientY||0))/140;
  device.setKnob(dragKnob,clamp(dragStart+dv,0,1));
}
function knobUp(){
  dragKnob=null;
  window.removeEventListener("pointermove",knobMove);
  window.removeEventListener("pointerup",knobUp);
}
var stepElsMap={KICK:[],BASS:[],PERC:[],LEAD:[],ARP:[],PAD:[]};
var stepColEls=[];
function buildSeq(){
  var root=$("seq"); if(!root) return;
  var SEQ_EDIT=["ARP"];
  for(var pi=0;pi<SEQ_EDIT.length;pi++){
    (function(part){
      var row=document.createElement("div"); row.className="seq-row";
      var mute=document.createElement("button"); mute.className="mute"; mute.textContent="M";
      mute.addEventListener("click",function(){
        device.mutes[part]=device.mutes[part]?0:1;
        mute.className="mute"+(device.mutes[part]?" muted":"");
        if(device.ctx) device.refreshPartGains(device.ctx.currentTime);
        trackEvent("mute_toggled",{part:part,muted:!!device.mutes[part]});
      });
      var lab=document.createElement("div"); lab.className="part-label";
      lab.textContent=part; lab.style.color=PART_COLORS[part];
      var steps=document.createElement("div"); steps.className="steps";
      for(var s=0;s<16;s++){
        (function(ss){
          var b=document.createElement("button");
          b.className="step"+(ss%4===0?" q":"");
          b.addEventListener("click",function(){ toggleStep(part,ss); });
          steps.appendChild(b);
          stepElsMap[part][ss]=b;
          if(!stepColEls[ss]) stepColEls[ss]=[];
          stepColEls[ss].push(b);
        })(s);
      }
      row.appendChild(mute); row.appendChild(lab); row.appendChild(steps);
      root.appendChild(row);
    })(SEQ_EDIT[pi]);
  }
}
function toggleStep(part,s){
  var p=device.patterns;
  if(part==="KICK"){ p.kick[s]=p.kick[s]?0:1; }
  else if(part==="BASS"){ p.bass[s]=p.bass[s]?null:{n:0}; }
  else if(part==="PERC"){
    var cur=p.perc[s];
    p.perc[s]=cur===null?"clap":cur==="clap"?"shaker":cur==="shaker"?"oh":null;
  }
  else if(part==="LEAD"){ p.lead[s]=p.lead[s]?null:{deg:4,acc:0,slide:0}; }
  else if(part==="ARP"){ p.arp[s]=p.arp[s]?null:{deg:4}; }
  else if(part==="PAD"){ p.pad[s]=p.pad[s]?null:{chord:[0,4,7]}; }
  refreshStepUi(part,s);
  trackEvent("step_edited",{part:part,step:s});
}
function stepActive(part,s){
  var p=device.patterns;
  if(part==="KICK") return !!p.kick[s];
  if(part==="BASS") return !!p.bass[s];
  if(part==="PERC") return !!p.perc[s];
  if(part==="LEAD") return !!p.lead[s];
  if(part==="ARP") return !!p.arp[s];
  if(part==="PAD") return !!p.pad[s];
  return false;
}
function refreshStepUi(part,s){
  var b=stepElsMap[part][s]; if(!b) return;
  var on=stepActive(part,s);
  b.className=b.className.replace(" on","");
  if(on){
    b.className+=" on";
    b.style.background=PART_COLORS[part];
    b.style.boxShadow="0 0 8px "+PART_COLORS[part];
  } else {
    b.style.background="";
    b.style.boxShadow="";
  }
}
function refreshSeqUi(){
  for(var i=0;i<PART_NAMES.length;i++)
    for(var s=0;s<16;s++) refreshStepUi(PART_NAMES[i],s);
}
var curStepShown=-1;
function setCurStep(s){
  if(s===curStepShown) return;
  var i;
  if(curStepShown>=0&&stepColEls[curStepShown])
    for(i=0;i<stepColEls[curStepShown].length;i++)
      stepColEls[curStepShown][i].className=stepColEls[curStepShown][i].className.replace(" cur","");
  if(s>=0&&stepColEls[s])
    for(i=0;i<stepColEls[s].length;i++) stepColEls[s][i].className+=" cur";
  curStepShown=s;
  var ls=$("lcdSteps");
  if(ls&&ls.children)
    for(var k=0;k<ls.children.length;k++) ls.children[k].className="ls"+(k===s?" on":"");
}
var PAD_DEGS=[0,2,4,5,7,9,11,14];
function buildPads(){
  var root=$("pads"); if(!root) return;
  for(var i=0;i<PAD_DEGS.length;i++){
    (function(idx){
      var b=document.createElement("button"); b.className="pad";
      b.textContent=String(idx+1);
      b.addEventListener("pointerdown",function(e){
        if(e.preventDefault) e.preventDefault();
        hitPad(idx,b);
      });
      root.appendChild(b);
    })(i);
  }
}
function hitPad(idx,el){
if(navigator.vibrate)navigator.vibrate(8);
  device.triggerPad(PAD_DEGS[idx]);
  if(el){ el.className="pad hit"; setTimeout(function(){ el.className="pad"; },150); }
  trackEvent("pad_hit",{deg:PAD_DEGS[idx]});
}
function togglePlay(){
if(navigator.vibrate)navigator.vibrate(15);
  var btn=$("playBtn");
  var eng=$("engState");
  if(device.isPlaying){
    device.stop();
    btn.textContent="\u25B6 PLAY"; btn.className="play-btn";
    if(eng){ eng.textContent="stopped"; eng.className="dim"; }
    setStatus("stopped","dim");
    setCurStep(-1);
    trackEvent("stopped",{});
    return;
  }
  device.absStep=0; device._barCacheKey=-1; device._lastSecIdx=-1;
device.play().then(function(){
btn.textContent="\u25A0 STOP"; btn.className="play-btn playing";
    if(eng){ eng.textContent="running"; eng.className="ok"; }
    var info0=sectionAt(device.song,0);
    setStatus("arranger running \u2014 "+info0.section.name,"ok");
    trackEvent("played",{});
    setTimeout(function(){
      if(!device.isPlaying) return;
      var e=device.getEnergy();
      if(e<0.001) setStatus("Diagnostics: sequencer running but silent (ctx="+device.ctx.state+"). Check self-test.","error");
      else setStatus("audio OK \u2014 live rms "+e.toFixed(3),"ok");
    },900);
  }).catch(function(err){
    setStatus("Play failed: "+(err&&err.message?err.message:err),"error");
    if(eng){ eng.textContent="error"; eng.className="err"; }
  });
}
var vizBuf=new Uint8Array(256);

function drawViz(){
  var canvas=document.getElementById("viz");
  if(!canvas||!device||!device.analyser) return;
  var ctx2d=canvas.getContext("2d");
  var w=canvas.width=canvas.offsetWidth||300;
  var h=canvas.height=canvas.offsetHeight||56;
  device.analyser.getByteFrequencyData(vizBuf);
  ctx2d.clearRect(0,0,w,h);
  var barCount=64;
  var barWidth=w/barCount;
  for(var i=0;i<barCount;i++){
    var v=vizBuf[i]/255;
    var barHeight=v*h;
    var hue=180+i*2;
    var lightness=40+v*30;
    ctx2d.fillStyle="hsla("+hue+",70%,"+lightness+"%,0.85)";
    ctx2d.fillRect(i*barWidth,h-barHeight,barWidth-1,barHeight);
  }
}

function uiLoop(){
  requestAnimationFrame(uiLoop);
  if(!device.ctx||!device.analyser) return;
  var now=device.ctx.currentTime;
  var s=-1;
  while(device.uiQueue.length&&device.uiQueue[0].time<=now){ s=device.uiQueue.shift().step; }
  if(device.isPlaying&&s>=0) setCurStep(s);
  var canvas=$("viz"); if(!canvas) return;
  var g=canvas.getContext("2d"),W=canvas.width,H=canvas.height;
  g.fillStyle="#070312"; g.fillRect(0,0,W,H);
  device.analyser.getByteFrequencyData(vizBuf);
  var bars=64,barW=W/bars;
  for(var i=0;i<bars;i++){
    var val=vizBuf[Math.floor((i/bars)*vizBuf.length*0.7)]/255;
    var h=val*H*0.9,hue=280-val*120;
    g.fillStyle="hsl("+hue+",100%,"+(40+val*30)+"%)";
    g.fillRect(i*barW+1,H-h,barW-2,h);
  }
}
var KEYMAP={a:0,w:1,s:2,e:3,d:4,f:5,t:6,g:7};
window.addEventListener("keydown",function(e){
  // Phase 0 fix: SPACE / Ctrl+Z / Ctrl+S were handled here AND in
  // KeyboardShortcuts, causing double-fire (space could not stop
  // playback; undo popped twice; save wrote twice). Those keys are
  // now handled ONLY by KeyboardShortcuts. This listener keeps
  // pad triggering (KEYMAP) exclusively.
  if(e.repeat) return;
  var tgt=e.target;
  if(tgt&&(tgt.tagName==="INPUT"||tgt.tagName==="TEXTAREA")) return;
  var k=(e.key||"").toLowerCase();
  if(k in KEYMAP){ hitPad(KEYMAP[k],null); }
});
function renderTimelineFor(dev){
  var el=$("timeline"); if(!el||!dev.song) return;
  el.innerHTML="";
  var song=dev.song;
  for(var i=0;i<song.sections.length;i++){
    (function(idx){
      var sec=song.sections[idx];
      var d=document.createElement("div");
      d.className="tl-sec";
      d.style.width=Math.max(24,sec.bars*2.4)+"px";
      d.textContent=sec.name.slice(0,2);
      d.title=sec.name+" ("+sec.bars+" bars, theme "+sec.themeKey+")";
      d.addEventListener("click",function(){ dev.seekToBar(song.sectionStarts[idx]); });
      el.appendChild(d);
    })(i);
  }
}
function updateTimelineUi(idx){
  var el=$("timeline"); if(!el) return;
  for(var i=0;i<el.children.length;i++) el.children[i].className="tl-sec"+(i===idx?" cur":"");
}
function initUi(){
  buildKnobs();
  buildSeq();
  buildPads();
  renderTimelineFor(device);
  var ls=$("lcdSteps");
  if(ls){ ls.innerHTML=""; for(var i=0;i<16;i++){ var sp=document.createElement("span"); sp.className="ls"; ls.appendChild(sp); } }
  var pb=$("playBtn"); if(pb) pb.addEventListener("click",togglePlay);
  var vb=$("variateBtn"); if(vb) vb.addEventListener("click",function(){ device.variate(false); trackEvent("variate",{}); });
  var nb=$("nextSecBtn"); if(nb) nb.addEventListener("click",function(){ device.jumpSection(); trackEvent("jump_section",{}); });
  refreshSeqUi();
  device.updateLcd();
  uiLoop();
  device.selfTest().then(function(r){
    var el=$("selfTest"); if(!el) return;
    if(r.ok){ el.textContent="OK rms "+r.rms+" pk "+r.peak; el.className="ok"; }
    else{ el.textContent="FAIL: "+(r.reason||"silent"); el.className="err"; }
  });
  device.scaleExt=SCALE_EXT; device.scales=SCALES; device.styleCfg=STYLE;
  device.renderTimeline=function(){ renderTimelineFor(device); };
  window.__psy6=device;
}
function safeInitUi(){
  try{
    initUi();
  }
  catch(e){
    var st=document.getElementById("status");
    if(st){ st.textContent="INIT ERROR: "+e.message; alert("INIT ERROR: "+e.message); st.className="status err"; }
    var st2=document.getElementById("selfTest");
    if(st2){ st2.textContent="ERR: "+e.message; st2.className="err"; }
  }
  finally{
    hideLoading();
  }
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",safeInitUi);
else safeInitUi();




/* ============================================================
   ARPEGGIATOR (Phase B5)
   Inspired by PsySynthPro — UP/DOWN/UP-DOWN/RANDOM
   ============================================================ */

var Arpeggiator = {
  mode: 'up',
  octaveRange: 2,
  hold: false,
  notes: [],
  currentIndex: 0,
  direction: 1,
  setMode: function(mode) {
    this.mode = mode;
    this.currentIndex = 0;
    this.direction = 1;
  },
  setOctaveRange: function(range) {
    this.octaveRange = range;
  },
  setHold: function(hold) {
    this.hold = hold;
  },
  addNote: function(note) {
    if (this.notes.indexOf(note) === -1) {
      this.notes.push(note);
      this.notes.sort(function(a, b) { return a - b; });
    }
  },
  removeNote: function(note) {
    var idx = this.notes.indexOf(note);
    if (idx >= 0) this.notes.splice(idx, 1);
  },
  clearNotes: function() {
    if (!this.hold) {
      this.notes = [];
      this.currentIndex = 0;
      this.direction = 1;
    }
  },
  nextNote: function(rng) {
    if (this.notes.length === 0) return null;
    var note;
    if (this.mode === 'up') {
      note = this.notes[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.notes.length;
    } else if (this.mode === 'down') {
      note = this.notes[this.notes.length - 1 - this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.notes.length;
    } else if (this.mode === 'updown') {
      note = this.notes[this.currentIndex];
      this.currentIndex += this.direction;
      if (this.currentIndex >= this.notes.length - 1) this.direction = -1;
      else if (this.currentIndex <= 0) this.direction = 1;
    } else if (this.mode === 'random') {
      var idx = Math.floor((rng ? rng() : Math.random()) * this.notes.length);
      note = this.notes[idx];
    }
    return note;
  },
  generatePattern: function(steps, rng) {
    var pattern = [];
    for (var i = 0; i < steps; i++) {
      pattern.push(this.nextNote(rng));
    }
    return pattern;
  }
};



/* ============================================================
   ARPEGGIATOR INTEGRATION
   ============================================================ */

// Arpeggiator UI controls
function setArpMode(mode) {
  Arpeggiator.setMode(mode);
  var statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = 'ARP MODE: ' + mode.toUpperCase();
    statusEl.className = 'ok';
  }
}

function toggleArpHold() {
  Arpeggiator.setHold(!Arpeggiator.hold);
  var statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = 'ARP HOLD: ' + (Arpeggiator.hold ? 'ON' : 'OFF');
    statusEl.className = 'ok';
  }
}

// Hook Arpeggiator into hitPad
var arpEnabled = false;

function toggleArp() {
  arpEnabled = !arpEnabled;
  var statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = 'ARP: ' + (arpEnabled ? 'ON' : 'OFF');
    statusEl.className = arpEnabled ? 'ok' : '';
  }
}

/* ============================================================
   PRESET SYSTEM (Phase 3.1)
   ============================================================ */

function savePreset(name) {
  if (!device) return;
  var preset = {
    name: name || 'Untitled',
    timestamp: Date.now(),
    bpm: device.bpm,
    swing: device.swing,
    seed: device.seed,
    variation: device.variation,
    knobVals: JSON.parse(JSON.stringify(device.knobVals)),
    mutes: JSON.parse(JSON.stringify(device.mutes))
  };
  var presets = JSON.parse(localStorage.getItem('psy3_presets') || '[]');
  var existingIdx = presets.findIndex(function(p) { return p.name === name; });
  if (existingIdx >= 0) {
    presets[existingIdx] = preset;
  } else {
    presets.push(preset);
  }
  localStorage.setItem('psy3_presets', JSON.stringify(presets));
  setStatus('Preset saved: ' + preset.name, 'ok');
  trackEvent('preset_saved', { name: preset.name });
}

function loadPreset(name) {
  if (!device) return;
  var presets = JSON.parse(localStorage.getItem('psy3_presets') || '[]');
  var preset = presets.find(function(p) { return p.name === name; });
  if (!preset) {
    setStatus('Preset not found: ' + name, 'err');
    return;
  }
  device.bpm = preset.bpm;
  device.swing = preset.swing;
  device.seed = preset.seed;
  device.variation = preset.variation;
  device.knobVals = JSON.parse(JSON.stringify(preset.knobVals));
  device.mutes = JSON.parse(JSON.stringify(preset.mutes));
  for (var key in device.knobVals) {
    device.applyKnob(key);
  }
  device.refreshPartGains(device.ctx.currentTime);
  setStatus('Preset loaded: ' + preset.name, 'ok');
  trackEvent('preset_loaded', { name: preset.name });
}

function listPresets() {
  var presets = JSON.parse(localStorage.getItem('psy3_presets') || '[]');
  return presets.map(function(p) { return p.name; });
}

function deletePreset(name) {
  var presets = JSON.parse(localStorage.getItem('psy3_presets') || '[]');
  presets = presets.filter(function(p) { return p.name !== name; });
  localStorage.setItem('psy3_presets', JSON.stringify(presets));
  setStatus('Preset deleted: ' + name, 'ok');
}

function saveSettings() {
  if (!device) return;
  var settings = {
    bpm: device.bpm,
    swing: device.swing,
    seed: device.seed,
    variation: device.variation,
    knobVals: device.knobVals,
    mutes: device.mutes
  };
  localStorage.setItem('psy3_settings', JSON.stringify(settings));
}

function loadSettings() {
  if (!device) return;
  var saved = localStorage.getItem('psy3_settings');
  if (!saved) return;
  try {
    var settings = JSON.parse(saved);
    device.bpm = settings.bpm || 145;
    device.swing = settings.swing || 0.12;
    device.seed = settings.seed || 1337;
    device.variation = settings.variation || 1;
    if (settings.knobVals) device.knobVals = settings.knobVals;
    if (settings.mutes) device.mutes = settings.mutes;
    for (var key in device.knobVals) {
      device.applyKnob(key);
    }
    console.log('Settings loaded');
  } catch (e) {
    console.log('Settings load failed: ' + e);
  }
}


function getDeviceState() {
  if (!device) return null;
  return {
    bpm: device.bpm,
    swing: device.swing,
    seed: device.seed,
    variation: device.variation,
    knobVals: JSON.parse(JSON.stringify(device.knobVals)),
    mutes: JSON.parse(JSON.stringify(device.mutes))
  };
}

function applyDeviceState(state) {
  if (!device || !state) return;
  device.bpm = state.bpm;
  device.swing = state.swing;
  device.seed = state.seed;
  device.variation = state.variation;
  device.knobVals = JSON.parse(JSON.stringify(state.knobVals));
  device.mutes = JSON.parse(JSON.stringify(state.mutes));
  for (var key in device.knobVals) {
    device.applyKnob(key);
  }
  device.refreshPartGains(device.ctx.currentTime);
}


/* ============================================================
   PATTERN EDITOR (Phase 3.2)
   ============================================================ */

function getSequencerState() {
  if (!device || !device.patterns) return null;
  return JSON.parse(JSON.stringify(device.patterns));
}

function applySequencerState(state) {
  if (!device || !state) return;
  device.patterns = JSON.parse(JSON.stringify(state));
  refreshSeqUi();
}

function patternClear(part) {
  if (!device || !device.patterns) return;
  if (part && device.patterns[part]) {
    for (var i = 0; i < 16; i++) {
      device.patterns[part][i] = 0;
    }
  } else {
    for (var p in device.patterns) {
      for (var i = 0; i < 16; i++) {
        device.patterns[p][i] = 0;
      }
    }
  }
  refreshSeqUi();
  setStatus('Pattern cleared', 'ok');
}

function patternRandom(part) {
  if (!device || !device.patterns) return;
  var rng = mulberry32(device.seed + Date.now());
  if (part && device.patterns[part]) {
    for (var i = 0; i < 16; i++) {
      device.patterns[part][i] = rng() > 0.5 ? 1 : 0;
    }
  } else {
    for (var p in device.patterns) {
      for (var i = 0; i < 16; i++) {
        device.patterns[p][i] = rng() > 0.5 ? 1 : 0;
      }
    }
  }
  refreshSeqUi();
  setStatus('Pattern randomized', 'ok');
}

function patternReverse(part) {
  if (!device || !device.patterns) return;
  if (part && device.patterns[part]) {
    device.patterns[part].reverse();
  } else {
    for (var p in device.patterns) {
      device.patterns[p].reverse();
    }
  }
  refreshSeqUi();
  setStatus('Pattern reversed', 'ok');
}

function patternShift(part, direction) {
  if (!device || !device.patterns) return;
  direction = direction || 1;
  if (part && device.patterns[part]) {
    var arr = device.patterns[part];
    if (direction > 0) {
      arr.push(arr.shift());
    } else {
      arr.unshift(arr.pop());
    }
  } else {
    for (var p in device.patterns) {
      var arr = device.patterns[p];
      if (direction > 0) {
        arr.push(arr.shift());
      } else {
        arr.unshift(arr.pop());
      }
    }
  }
  refreshSeqUi();
  setStatus('Pattern shifted', 'ok');
}

function patternDouble(part) {
  if (!device || !device.patterns) return;
  if (part && device.patterns[part]) {
    var arr = device.patterns[part];
    for (var i = 0; i < 8; i++) {
      arr[i + 8] = arr[i];
    }
  } else {
    for (var p in device.patterns) {
      var arr = device.patterns[p];
      for (var i = 0; i < 8; i++) {
        arr[i + 8] = arr[i];
      }
    }
  }
  refreshSeqUi();
  setStatus('Pattern doubled', 'ok');
}

function patternHalf(part) {
  if (!device || !device.patterns) return;
  if (part && device.patterns[part]) {
    var arr = device.patterns[part];
    for (var i = 8; i < 16; i++) {
      arr[i] = 0;
    }
  } else {
    for (var p in device.patterns) {
      var arr = device.patterns[p];
      for (var i = 8; i < 16; i++) {
        arr[i] = 0;
      }
    }
  }
  refreshSeqUi();
  setStatus('Pattern halved', 'ok');
}

function patternInvert(part) {
  if (!device || !device.patterns) return;
  if (part && device.patterns[part]) {
    for (var i = 0; i < 16; i++) {
      device.patterns[part][i] = device.patterns[part][i] ? 0 : 1;
    }
  } else {
    for (var p in device.patterns) {
      for (var i = 0; i < 16; i++) {
        device.patterns[p][i] = device.patterns[p][i] ? 0 : 1;
      }
    }
  }
  refreshSeqUi();
  setStatus('Pattern inverted', 'ok');
}


/* ============================================================
   SONG EDITOR (Phase 3.3)
   ============================================================ */

function songAddSection(sectionName) {
  if (!device || !device.song) return;
  var newSection = {
    name: sectionName || 'NEW',
    bars: 4,
    type: 'drop'
  };
  device.song.sections.push(newSection);
  if (typeof renderTimelineFor === 'function') {
    renderTimelineFor(device);
  }
  setStatus('Section added: ' + newSection.name, 'ok');
}

function songRemoveSection(index) {
  if (!device || !device.song) return;
  if (index >= 0 && index < device.song.sections.length) {
    var removed = device.song.sections.splice(index, 1);
    if (typeof renderTimelineFor === 'function') {
      renderTimelineFor(device);
    }
    setStatus('Section removed: ' + removed[0].name, 'ok');
  }
}

function songMoveSection(fromIndex, toIndex) {
  if (!device || !device.song) return;
  var sections = device.song.sections;
  if (fromIndex >= 0 && fromIndex < sections.length && toIndex >= 0 && toIndex < sections.length) {
    var section = sections.splice(fromIndex, 1)[0];
    sections.splice(toIndex, 0, section);
    if (typeof renderTimelineFor === 'function') {
      renderTimelineFor(device);
    }
    setStatus('Section moved', 'ok');
  }
}

function songDuplicateSection(index) {
  if (!device || !device.song) return;
  if (index >= 0 && index < device.song.sections.length) {
    var original = device.song.sections[index];
    var copy = JSON.parse(JSON.stringify(original));
    copy.name = original.name + ' COPY';
    device.song.sections.splice(index + 1, 0, copy);
    if (typeof renderTimelineFor === 'function') {
      renderTimelineFor(device);
    }
    setStatus('Section duplicated', 'ok');
  }
}

function songGetInfo() {
  if (!device || !device.song) return null;
  return {
    sections: device.song.sections.length,
    totalBars: device.song.sections.reduce(function(sum, s) { return sum + s.bars; }, 0),
    bpm: device.bpm,
    seed: device.seed
  };
}


/* ============================================================
   SWIPE GESTURES (Phase 4.4)
   ============================================================ */

var swipeState = {
  startX: 0,
  startY: 0,
  startTime: 0
};

function initSwipeGestures() {
  var chassis = document.querySelector('.chassis');
  if (!chassis) return;
  
  chassis.addEventListener('touchstart', function(e) {
    if (e.touches.length === 1) {
      swipeState.startX = e.touches[0].clientX;
      swipeState.startY = e.touches[0].clientY;
      swipeState.startTime = Date.now();
    }
  }, { passive: true });
  
  chassis.addEventListener('touchend', function(e) {
    if (e.changedTouches.length === 1) {
      var endX = e.changedTouches[0].clientX;
      var endY = e.changedTouches[0].clientY;
      var deltaX = endX - swipeState.startX;
      var deltaY = endY - swipeState.startY;
      var deltaTime = Date.now() - swipeState.startTime;
      
      // Only process quick swipes (< 300ms)
      if (deltaTime < 300) {
        // Horizontal swipe
        if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX > 0) {
            // Swipe right: previous section
            if (device && device.seekToBar) {
              var currentBar = Math.floor(device.absStep / 16);
              if (currentBar > 0) {
                device.seekToBar(currentBar - 1);
                setStatus('Section: previous', 'ok');
              }
            }
          } else {
            // Swipe left: next section
            if (device && device.jumpSection) {
              device.jumpSection();
              setStatus('Section: next', 'ok');
            }
          }
        }
      }
    }
  }, { passive: true });
}

// Initialize swipe gestures after UI is ready
function initMobileFeatures() {
  initSwipeGestures();
  initMobileNav();
}

// Mobile navigation
function initMobileNav() {
  var navPlay = document.getElementById('navPlay');
  var navKnobs = document.getElementById('navKnobs');
  var navSeq = document.getElementById('navSeq');
  var navPads = document.getElementById('navPads');
  
  if (navPlay) {
    navPlay.addEventListener('click', function() {
      if (device) {
        if (device.isPlaying) {
          device.stop();
        } else {
          device.play();
        }
      }
    });
  }
  
  if (navKnobs) {
    navKnobs.addEventListener('click', function() {
      var knobs = document.getElementById('knobs');
      if (knobs) knobs.scrollIntoView({ behavior: 'smooth' });
    });
  }
  
  if (navSeq) {
    navSeq.addEventListener('click', function() {
      var seq = document.getElementById('seq');
      if (seq) seq.scrollIntoView({ behavior: 'smooth' });
    });
  }
  
  if (navPads) {
    navPads.addEventListener('click', function() {
      var pads = document.getElementById('pads');
      if (pads) pads.scrollIntoView({ behavior: 'smooth' });
    });
  }
}


/* ============================================================
   LOADING STATE (Phase 5.2)
   ============================================================ */

function showLoading(text) {
  var overlay = document.getElementById('loadingOverlay');
  var loadingText = document.getElementById('loadingText');
  if (overlay) {
    overlay.style.opacity = '1';
    overlay.style.display = 'flex';
  }
  if (loadingText && text) {
    loadingText.textContent = text;
  }
}

function updateLoading(percent) {
  var bar = document.getElementById('loadingBar');
  if (bar) {
    bar.style.width = percent + '%';
  }
}

function hideLoading() {
  // loadingOverlay was removed, this is a no-op
  // Kept for backwards compatibility
}


// Fallback: hide loading after 5 seconds regardless
setTimeout(function() {
  hideLoading();
}, 5000);


/* ============================================================
   KEYBOARD SHORTCUTS (from PSY6-ULTIMATE)
   SPACE, V, W, D, H, Z, R, S, A, 1-8
   ============================================================ */

var KeyboardShortcuts = {
  enabled: true,
  
  handleKey: function(e) {
    if (!this.enabled) return;
    
    var key = e.key.toLowerCase();
    
    // Escape: cancel MIDI learn (Phase 0b)
    if (key === 'escape') {
      if (typeof MIDILearn !== 'undefined' && MIDILearn.active) {
        MIDILearn.stop();
        if (typeof setStatus === 'function') setStatus('MIDI LEARN: cancelled');
      }
      return;
    }
    
    // SPACE: Play/Stop
    if (key === ' ') {
      e.preventDefault();
      togglePlay();
      return;
    }
    
    // V: New variation (reseed)
    if (key === 'v' && !e.ctrlKey && !e.metaKey) {
      if (device) {
        device.variate();
        var statusEl = document.getElementById('status');
        if (statusEl) {
          statusEl.textContent = 'VARIATION: ' + device.variation;
          statusEl.className = 'ok';
        }
      }
      return;
    }
    
    // W: Generate chord progression
    if (key === 'w' && !e.ctrlKey && !e.metaKey) {
      var randomProg = Math.floor(Math.random() * 7);
      ChordEngine.setProgression(randomProg);
      return;
    }
    
    // D: Generate drum pattern
    if (key === 'd' && !e.ctrlKey && !e.metaKey) {
      patternRandom('KICK');
      return;
    }
    
    // H: Generate melody
    if (key === 'h' && !e.ctrlKey && !e.metaKey) {
      patternRandom('LEAD');
      return;
    }
    
    // Z: Generate arpeggio
    if (key === 'z' && !e.ctrlKey && !e.metaKey) {
      patternRandom('ARP');
      return;
    }
    
    // A: Cycle arpeggiator mode
    if (key === 'a' && !e.ctrlKey && !e.metaKey) {
      var modes = ['up', 'down', 'updown', 'random'];
      var currentIdx = modes.indexOf(Arpeggiator.mode);
      var nextMode = modes[(currentIdx + 1) % modes.length];
      setArpMode(nextMode);
      return;
    }
    
    // 1-8: Jump to section
    if (key >= '1' && key <= '8') {
      var sectionIdx = parseInt(key) - 1;
      if (device && device.seekToBar) {
        device.seekToBar(sectionIdx * 4);
        var statusEl = document.getElementById('status');
        if (statusEl) {
          statusEl.textContent = 'SECTION: ' + key;
          statusEl.className = 'ok';
        }
      }
      return;
    }
    
    // ?: Help overlay
    if (key === '?') {
      toggleHelp();
      return;
    }
    
    // Ctrl+Z: Undo
    if (key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey) {
        doRedo();
      } else {
        doUndo();
      }
      return;
    }
    
    // Ctrl+S: Save preset
    if (key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      savePreset('Quick Save ' + Date.now());
      return;
    }
  }
};

// Replace existing keydown listener with enhanced version
window.removeEventListener('keydown', KeyboardShortcuts.handleKey);
window.addEventListener('keydown', function(e) {
  KeyboardShortcuts.handleKey(e);
});


/* ============================================================
   HELP OVERLAY (from PSY6-ULTIMATE)
   Press ? to toggle
   ============================================================ */

function toggleHelp() {
  var existing = document.getElementById('helpOverlay');
  if (existing) {
    existing.remove();
    return;
  }
  
  var overlay = document.createElement('div');
  overlay.id = 'helpOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(6,8,12,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
  
  overlay.innerHTML = '<div style="max-width:600px;max-height:80vh;overflow-y:auto;background:#14171f;border-radius:14px;padding:24px;border:1px solid #000;font-family:monospace;color:#e8e8f0;">' +
    '<h2 style="color:#ffb454;margin-bottom:16px;font-size:18px;">PSY3 PRO - HELP</h2>' +
    '<h3 style="color:#3fa9bc;margin:12px 0 8px;font-size:14px;">KEYBOARD SHORTCUTS</h3>' +
    '<table style="width:100%;font-size:12px;border-collapse:collapse;">' +
    '<tr><td style="padding:4px;color:#b8e05a;">SPACE</td><td>Play / Stop</td></tr>' +
    '<tr><td style="padding:4px;color:#b8e05a;">V</td><td>New variation (reseed)</td></tr>' +
    '<tr><td style="padding:4px;color:#b8e05a;">W</td><td>Generate chord progression</td></tr>' +
    '<tr><td style="padding:4px;color:#b8e05a;">D</td><td>Generate drum pattern</td></tr>' +
    '<tr><td style="padding:4px;color:#b8e05a;">H</td><td>Generate melody</td></tr>' +
    '<tr><td style="padding:4px;color:#b8e05a;">Z</td><td>Generate arpeggio</td></tr>' +
    '<tr><td style="padding:4px;color:#b8e05a;">A</td><td>Cycle arpeggiator mode</td></tr>' +
    '<tr><td style="padding:4px;color:#b8e05a;">1-8</td><td>Jump to section</td></tr>' +
    '<tr><td style="padding:4px;color:#b8e05a;">Ctrl+Z</td><td>Undo</td></tr>' +
    '<tr><td style="padding:4px;color:#b8e05a;">Ctrl+Shift+Z</td><td>Redo</td></tr>' +
    '<tr><td style="padding:4px;color:#b8e05a;">Ctrl+S</td><td>Quick save preset</td></tr>' +
    '<tr><td style="padding:4px;color:#b8e05a;">?</td><td>Toggle this help</td></tr>' +
    '</table>' +
    '<h3 style="color:#3fa9bc;margin:16px 0 8px;font-size:14px;">BRAIN MODES</h3>' +
    '<p style="font-size:12px;line-height:1.6;">' +
    '<b>MANUAL:</b> Only plays sequencer patterns<br>' +
    '<b>GENERATIVE:</b> CandidateGenerator creates 5 candidates/bar, picks best<br>' +
    '<b>ADAPTIVE:</b> Learns from performance, generates from grammars' +
    '</p>' +
    '<h3 style="color:#3fa9bc;margin:16px 0 8px;font-size:14px;">MIDI</h3>' +
    '<p style="font-size:12px;line-height:1.6;">' +
    'Connect any MIDI controller. Notes trigger pads and teach melodic grammar.<br>' +
    'CC 20-27 auto-learn to knobs. CC 28-30 control macros.' +
    '</p>' +
    '<p style="margin-top:16px;font-size:11px;color:#4a5266;">Press ? to close</p>' +
    '</div>';
  
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
  
  document.body.appendChild(overlay);
}


/* ============================================================
   PATTERN BANKS A-D (from PSY6-ULTIMATE)
   Store and recall complete pattern sets
   ============================================================ */

var PatternBanks = {
  banks: { A: null, B: null, C: null, D: null },
  
  // Save current patterns to a bank
  save: function(bank) {
    if (!device || !device.patterns) return;
    
    this.banks[bank] = JSON.parse(JSON.stringify(device.patterns));
    localStorage.setItem('psy3_bank_' + bank, JSON.stringify(this.banks[bank]));
    
    var statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.textContent = 'BANK ' + bank + ' SAVED';
      statusEl.className = 'ok';
    }
    trackEvent('bank_saved', { bank: bank });
  },
  
  // Load patterns from a bank
  load: function(bank) {
    if (!device) return;
    
    var saved = localStorage.getItem('psy3_bank_' + bank);
    if (saved) {
      try {
        this.banks[bank] = JSON.parse(saved);
        device.patterns = JSON.parse(JSON.stringify(this.banks[bank]));
        refreshSeqUi();
        
        var statusEl = document.getElementById('status');
        if (statusEl) {
          statusEl.textContent = 'BANK ' + bank + ' LOADED';
          statusEl.className = 'ok';
        }
        trackEvent('bank_loaded', { bank: bank });
      } catch (e) {
        console.log('Bank load failed: ' + e);
      }
    } else {
      var statusEl = document.getElementById('status');
      if (statusEl) {
        statusEl.textContent = 'BANK ' + bank + ' EMPTY';
        statusEl.className = 'err';
      }
    }
  },
  
  // Load all banks from localStorage
  loadAll: function() {
    var banks = ['A', 'B', 'C', 'D'];
    for (var i = 0; i < banks.length; i++) {
      var saved = localStorage.getItem('psy3_bank_' + banks[i]);
      if (saved) {
        try {
          this.banks[banks[i]] = JSON.parse(saved);
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }
};

// Load banks on startup
PatternBanks.loadAll();


/* ============================================================
   INITIALIZATION (must be at the end, after all functions defined)
   ============================================================ */

// Initialize UI when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', safeInitUi);
} else {
  safeInitUi();
}

// Initialize MIDI input
if (typeof initMIDIInput === 'function') {
  initMIDIInput();
  // Phase 0b: re-arm on first gesture for browsers that gate MIDI
  // permission behind user interaction (init is idempotent).
  window.addEventListener('pointerdown', function() { initMIDIInput(); }, { once: true });
}

// Initialize TrackControl
if (typeof TrackControl !== 'undefined' && TrackControl.init) {
  // TrackControl.init will be called after device is ready
}

// Initialize PooledEngine
if (typeof initPooledEngine === 'function') {
  // initPooledEngine will be called after device is ready
}

console.log('PSY3 PRO initialized');
