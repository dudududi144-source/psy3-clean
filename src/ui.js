
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
  if(typeof commitUndo==="function") commitUndo(); // Phase 0c: make Ctrl+Z real
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
  if(typeof commitUndo==="function") commitUndo(); // Phase 0c: baseline history entry
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