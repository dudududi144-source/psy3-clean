
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