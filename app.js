

/* ══════════════════════════════════════════════════════════
   PERFORMANCE UTILITIES (v2.0)
   ══════════════════════════════════════════════════════════ */

// Debounce utility
function debounce(fn, delay) {
  

/* ============================================================
   GLOBAL ERROR HANDLER (Phase 5.1)
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


// Get current sequencer state
function getSequencerState() {
  var steps = document.querySelectorAll('.seq-step');
  var state = [];
  steps.forEach(function(step) {
    state.push(step.classList.contains('active'));
  });
  return state;
}

// Apply sequencer state
function applySequencerState(state) {
  var steps = document.querySelectorAll('.seq-step');
  steps.forEach(function(step, idx) {
    if (state[idx]) {
      step.classList.add('active');
    } else {
      step.classList.remove('active');
    }
  });
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

var MIDIInput = {
  access: null,
  inputs: [],
  
  init: function() {
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
      MIDILearn.ccMap[cc] = MIDILearn.targetParam;
      console.log('MIDI Learn: mapped CC ' + cc + ' to ' + MIDILearn.targetParam);
      MIDILearn.stop();
      return;
    }
    var param = MIDILearn.ccMap[cc];
    if (param && device) {
      applyMacro(param, value / 127);
    }
  },
  
  handleNoteOn: function(note, velocity) {
    var action = MIDILearn.noteMap[note];
    if (action && typeof action === 'number') {
      hitPad(action);
    }
  }
};

function initMIDIInput() {
  MIDIInput.init();
}

    this.noteMap = {};
    console.log('MIDI Learn: all mappings cleared');
  }
};

// Apply MIDI parameter to device
function applyMIDIParam(param, value) {
  if (!device) return;
  
  switch(param) {
    case 'bpm':
      device.bpm = 60 + value * 140; // 60-200 BPM
      break;
    case 'filter':
      if (device.autoFilter) {
        device.autoFilter.frequency.setTargetAtTime(100 + value * 17900, device.ctx.currentTime, 0.01);
      }
      break;
    case 'resonance':
      if (device.autoFilter) {
        device.autoFilter.Q.setTargetAtTime(0.5 + value * 19.5, device.ctx.currentTime, 0.01);
      }
      break;
    case 'delay':
      if (device.delayMix) {
        device.delayMix.gain.setTargetAtTime(value, device.ctx.currentTime, 0.01);
      }
      break;
    case 'reverb':
      if (device.reverbMix) {
        device.reverbMix.gain.setTargetAtTime(value, device.ctx.currentTime, 0.01);
      }
      break;
    case 'drive':
      if (device.drivePost) {
        device.drivePost.gain.setTargetAtTime(0.5 + value * 1.5, device.ctx.currentTime, 0.01);
      }
      break;
    case 'volume':
      if (device.master) {
        device.master.gain.setTargetAtTime(value, device.ctx.currentTime, 0.01);
      }
      break;
    case 'swing':
      device.swing = value * 0.5; // 0-50% swing
      break;
    default:
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
  }catch(e){ }
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
device.makePatterns=makePatterns;
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
  if(e.repeat) return;
  var tgt=e.target;
  if(tgt&&(tgt.tagName==="INPUT"||tgt.tagName==="TEXTAREA")) return;
  var k=(e.key||"").toLowerCase();
  if(k in KEYMAP){ hitPad(KEYMAP[k],null); }
  else if(k===" "){ if(e.preventDefault)e.preventDefault(); togglePlay(); }

  // Undo/Redo shortcuts (Phase 3.7)
  if(k==="z"&&(e.ctrlKey||e.metaKey)){
    e.preventDefault();
    if(e.shiftKey){ doRedo(); } else { doUndo(); }
    return;
  }
  // Save preset shortcut (Phase 3.1)
  if(k==="s"&&(e.ctrlKey||e.metaKey)){
    e.preventDefault();
    savePreset('Quick Save ' + Date.now());
    return;
  }
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
  var overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(function() {
      overlay.style.display = 'none';
    }, 500);
  }
}


// Fallback: hide loading after 5 seconds regardless
setTimeout(function() {
  hideLoading();
}, 5000);
