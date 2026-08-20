

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
  pad[0]={chord:[0,7,12]}; // Phase 2: root-fifth-octave drone (matches old runtime voicing)
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

function makeVoices(ctx,outMap,sends,noiseBuf,getCfg){ // Phase 2: getCfg() thunk => live genre config per note
  function kick(t){
    var cfg=getCfg(); // Phase 2: live genre config
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
    var cfg=getCfg(); // Phase 2: live genre config
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
    var cfg=getCfg(); // Phase 2: live genre config
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
    // Phase 2: gate support — a lead note can now sustain for its written
    // duration. Without opts.gate the legacy fixed 240ms envelope is
    // reproduced exactly (arp/pads/pad-triggers keep their sound).
    var gate=(opts&&typeof opts.gate==="number"&&opts.gate>0)?opts.gate:0;
    flt.frequency.setValueAtTime(280,t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(300,peak),t+0.016);
    flt.frequency.exponentialRampToValueAtTime(380,t+(gate>0?Math.max(0.10,gate*0.85):0.22));
    var g=ctx.createGain();
    var lvl=cfg.leadLvl*(acc===2?1.0:(acc===1?0.85:0.7));
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(lvl,t+0.009);
    if(gate>0){
      g.gain.exponentialRampToValueAtTime(Math.max(0.0011,lvl*0.72),t+gate*0.75);
      g.gain.exponentialRampToValueAtTime(0.001,t+gate);
    }else{
      g.gain.exponentialRampToValueAtTime(0.001,t+0.24);
    }
    o1.connect(flt); o2.connect(flt); flt.connect(g); g.connect(outMap.LEAD);
    if(sends.delay){ var sd=ctx.createGain(); sd.gain.value=0.4; g.connect(sd); sd.connect(sends.delay); }
    if(sends.reverb){ var sr2=ctx.createGain(); sr2.gain.value=0.25; g.connect(sr2); sr2.connect(sends.reverb); }
    o1.start(t); o2.start(t); o1.stop(t+(gate>0?gate+0.03:0.26)); o2.stop(t+(gate>0?gate+0.03:0.26));
  }
  function arpNote(t,midi,acc){
    var cfg=getCfg(); // Phase 2: live genre config
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
    var cfg=getCfg(); // Phase 2: live genre config
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