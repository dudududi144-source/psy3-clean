




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
    mutes: JSON.parse(JSON.stringify(device.mutes)),
    genre: device.genre || 'FULL-ON' // Phase 4: sound preset travels with the preset
  };
  var presets = JSON.parse(localStorage.getItem('psy3_presets') || '[]');
  var existingIdx = presets.findIndex(function(p) { return p.name === name; });
  if (existingIdx >= 0) {
    presets[existingIdx] = preset;
  } else {
    presets.push(preset);
  }
  localStorage.setItem('psy3_presets', JSON.stringify(presets));
  if (typeof saveSettings === 'function') saveSettings(); // Phase 0c: persist live settings too
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
  if (preset.genre && typeof device.setGenre === 'function') device.setGenre(preset.genre); // Phase 4
  if (device.ctx) device.refreshPartGains(device.ctx.currentTime); // Phase 0c: ctx guard
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
    mutes: device.mutes,
    genre: device.genre || 'FULL-ON' // Phase 2
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
    // Phase 0c: keep patterns/song consistent with the restored seed.
    device.patterns = makePatterns(device.seed);
    device.patternEdited = { bass:false, lead:false }; // Phase 2: reseed restores arrangement control
    device.song = buildSong(device.seed);
    device._barCacheKey = -1;
    // Phase 2: restore genre preset (setGenre guards LCD/status if UI not up yet)
    if (settings.genre && typeof device.setGenre === 'function') device.setGenre(settings.genre);
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
    mutes: JSON.parse(JSON.stringify(device.mutes)),
    genre: device.genre||"FULL-ON", // Phase 2: sound preset in undo state
    sectionPatterns: JSON.parse(JSON.stringify(device.sectionPatterns||{})),
    song: JSON.parse(JSON.stringify(device.song)), // Session 26: arrangement belongs in the undo state
    partLen: JSON.parse(JSON.stringify(device.partLen||{})), // Session 28: loop lengths
    chance: JSON.parse(JSON.stringify(device.chance||{PERC:new Array(16).fill(1),ARP:new Array(16).fill(1)})), // Session 34: per-step chance
    // Phase 0c: patterns were missing from the snapshot, so undo could
    // never restore step edits. Deep copy (JSON-safe data).
    patterns: JSON.parse(JSON.stringify(device.patterns)),
    // Phase 2: takeover flags are part of the undoable state
    patternEdited: JSON.parse(JSON.stringify(device.patternEdited || { bass:false, lead:false }))
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
  // Phase 2: restore genre without side effects (no status/analytics during undo)
  if (state.genre) { device.genre = state.genre; STYLE.name = state.genre; }
  device.sectionPatterns = JSON.parse(JSON.stringify(state.sectionPatterns||{})); // Phase 2 BarPlan
  if (state.partLen) { device.partLen = JSON.parse(JSON.stringify(state.partLen)); } // Session 28
  if (state.chance) { device.chance = JSON.parse(JSON.stringify(state.chance)); } // Session 34
  else if (state.percProb) { device.chance = {PERC: JSON.parse(JSON.stringify(state.percProb)), ARP: new Array(16).fill(1)}; } // migrate Session 33
  if (state.song) {
    device.song = JSON.parse(JSON.stringify(state.song)); // Session 26: restore arrangement
    device._barCacheKey = -1;
    if (typeof renderTimelineFor === "function") renderTimelineFor(device);
  }
  // Phase 0c: restore patterns snapshot + refresh grid; guard ctx
  // (undo before first play previously threw TypeError on null ctx).
  if (state.patterns) {
    device.patterns = JSON.parse(JSON.stringify(state.patterns));
    // Phase 2: restore takeover flags (default = arrangement-driven)
    device.patternEdited = state.patternEdited ? JSON.parse(JSON.stringify(state.patternEdited)) : { bass:false, lead:false };
    if (typeof refreshSeqUi === 'function') refreshSeqUi();
  }
  if (device.ctx) device.refreshPartGains(device.ctx.currentTime);
}

// Phase 0c: snapshot helper — previously UndoRedo.push had zero callers,
// so Ctrl+Z/Ctrl+Shift+Z were silent no-ops despite the UI wiring.
function commitUndo() {
  if (typeof getDeviceState === 'function') {
    var st = getDeviceState();
    if (st) UndoRedo.push(st);
  }
}


/* ============================================================
   PATTERN EDITOR (session 31 rewrite: part-aware operations)
   Every part stores a different structure (kick=0/1, bass={n},
   perc=string, lead={deg,dur,accent}, arp={deg}, pad={chord}).
   The old ops blindly wrote 0/1 into ALL parts, corrupting the
   object structures. Ops are now part-aware: reverse/shift/double/
   half copy values safely; clear/random/invert build the correct
   structure per part. Each op commits undo + refreshes the grid.
   ============================================================ */

var PART_ORDER=["KICK","BASS","PERC","LEAD","ARP","PAD"];

function _patEmpty(part){
  if(part==="KICK") return 0;
  return null;
}
function _patRandom(part,rng){
  var r=rng();
  if(part==="KICK"){ return r<0.5?1:0; }
  if(part==="BASS"){ return r<0.30?null:{n:[0,0,0,7,10,12][Math.floor(rng()*6)]}; }
  if(part==="PERC"){ return r<0.5?null:(r<0.70?"clap":(r<0.90?"shaker":"oh")); }
  if(part==="LEAD"){ return r<0.35?null:{deg:Math.floor(rng()*8),dur:1,accent:rng(),rest:false}; }
  if(part==="ARP"){ return r<0.30?null:{deg:Math.floor(rng()*8),on:1}; }
  if(part==="PAD"){ return r<0.15?{chord:[0,7,12]}:null; }
  return null;
}
function _patInvert(part,val){
  if(part==="KICK"){ return val?0:1; }
  if(part==="BASS"){ return val?null:{n:0}; }
  if(part==="PERC"){ return val?null:"clap"; }
  if(part==="LEAD"){ return val?null:{deg:4,dur:1,accent:0.7,rest:false}; }
  if(part==="ARP"){ return val?null:{deg:4,on:1}; }
  if(part==="PAD"){ return val?null:{chord:[0,7,12]}; }
  return val?null:0;
}
function _patCommit(msg){
  if(typeof refreshSeqUi==="function") refreshSeqUi();
  if(typeof setStatus==="function") setStatus(msg,"ok");
  if(typeof commitUndo==="function") commitUndo();
}
function _patParts(part){
  if(!device||!device.patterns) return [];
  if(part&&device.patterns[part]) return [part];
  var all=[]; for(var i=0;i<PART_ORDER.length;i++){ if(device.patterns[PART_ORDER[i]]) all.push(PART_ORDER[i]); }
  return all;
}
function patternClear(part){
  var parts=_patParts(part); if(!parts.length) return;
  for(var k=0;k<parts.length;k++){
    var p=parts[k];
    for(var i=0;i<16;i++){ device.patterns[p][i]=_patEmpty(p); }
  }
  _patCommit("Pattern cleared"+(part?" ("+part+")":""));
}
function patternRandom(part){
  var parts=_patParts(part); if(!parts.length) return;
  var rng=mulberry32((device.seed+Date.now())>>>0);
  for(var k=0;k<parts.length;k++){
    var p=parts[k];
    for(var i=0;i<16;i++){ device.patterns[p][i]=_patRandom(p,rng); }
  }
  _patCommit("Pattern randomized"+(part?" ("+part+")":""));
}
function patternReverse(part){
  var parts=_patParts(part); if(!parts.length) return;
  for(var k=0;k<parts.length;k++){ device.patterns[parts[k]].reverse(); }
  _patCommit("Pattern reversed"+(part?" ("+part+")":""));
}
function patternShift(part,direction){
  var parts=_patParts(part); if(!parts.length) return;
  var dir=direction||1;
  for(var k=0;k<parts.length;k++){
    var arr=device.patterns[parts[k]];
    if(dir>0){ arr.unshift(arr.pop()); } else { arr.push(arr.shift()); }
  }
  _patCommit("Pattern shifted "+(dir>0?">>":"<<")+(part?" ("+part+")":""));
}
function patternDouble(part){
  var parts=_patParts(part); if(!parts.length) return;
  for(var k=0;k<parts.length;k++){
    var arr=device.patterns[parts[k]];
    var src=arr.slice();
    for(var i=0;i<16;i++){ arr[i]=src[Math.floor(i/2)]; }
  }
  _patCommit("Pattern doubled"+(part?" ("+part+")":""));
}
function patternHalf(part){
  var parts=_patParts(part); if(!parts.length) return;
  for(var k=0;k<parts.length;k++){
    var arr=device.patterns[parts[k]];
    var half=[]; for(var i2=0;i2<8;i2++){ half.push(arr[i2*2]); }
    for(var j=0;j<16;j++){ arr[j]=half[j%8]; }
  }
  _patCommit("Pattern halved"+(part?" ("+part+")":""));
}
function patternInvert(part){
  var parts=_patParts(part); if(!parts.length) return;
  for(var k=0;k<parts.length;k++){
    var p=parts[k];
    for(var i=0;i<16;i++){ device.patterns[p][i]=_patInvert(p,device.patterns[p][i]); }
  }
  _patCommit("Pattern inverted"+(part?" ("+part+")":""));
}

/* ============================================================
   ARRANGEMENT EDITOR (session 26)
   The arrangement stops being a fixed template. Sections can be
   added, removed, moved, duplicated and resized. Every section
   uses one of the seven canonical names so it keeps a valid
   mode/theme/bass-style/parts mapping, and every mutation
   reindexes sectionStarts/totalBars (the old helpers never did,
   which would have broken sectionAt() and playback).
   ============================================================ */

var SECTION_NAMES=["INTRO","BUILD","DROP","BREAK","RISER","DROP2","OUTRO"];

function songSectionDefaults(name,bars){
  var table={
    INTRO:  {themeKey:"transition",mode:"intro",bassStyle:"pedal"},
    BUILD:  {themeKey:"transition",mode:"drop",bassStyle:"gallop"},
    DROP:   {themeKey:"A",mode:"drop",bassStyle:"gallop"},
    BREAK:  {themeKey:"B",mode:"break",bassStyle:"pedal"},
    RISER:  {themeKey:"transition",mode:"riser",bassStyle:"offbeat"},
    DROP2:  {themeKey:"A2",mode:"drop2",bassStyle:"gallop"},
    OUTRO:  {themeKey:"transition",mode:"intro",bassStyle:"pedal"}
  };
  var t=table[name]||table.DROP;
  return {name:name,bars:bars||8,themeKey:t.themeKey,mode:t.mode,bassStyle:t.bassStyle,rootOffset:0};
}

function songReindex(){
  if(!device||!device.song) return;
  var s=device.song, cursor=0;
  s.sectionStarts=[];
  for(var i=0;i<s.sections.length;i++){ s.sectionStarts.push(cursor); cursor+=s.sections[i].bars; }
  s.totalBars=cursor;
  device._barCacheKey=-1;
}

function songAddSection(sectionName,afterIdx){
  if(!device||!device.song) return;
  var nm=SECTION_NAMES.indexOf(sectionName)>=0?sectionName:"DROP";
  var sec=songSectionDefaults(nm,8);
  var at=(typeof afterIdx==="number"&&afterIdx>=0&&afterIdx<device.song.sections.length)?afterIdx+1:device.song.sections.length;
  device.song.sections.splice(at,0,sec);
  songReindex();
  if(typeof renderTimelineFor==="function") renderTimelineFor(device);
  if(typeof setStatus==="function") setStatus("Section added: "+nm,"ok");
}

function songRemoveSection(index){
  if(!device||!device.song) return;
  var secs=device.song.sections;
  if(secs.length<=1){ if(typeof setStatus==="function") setStatus("Cannot remove the last section","err"); return; }
  if(index>=0&&index<secs.length){
    var removed=secs.splice(index,1)[0];
    songReindex();
    if(typeof renderTimelineFor==="function") renderTimelineFor(device);
    if(typeof setStatus==="function") setStatus("Section removed: "+removed.name,"ok");
  }
}

function songMoveSection(fromIndex,toIndex){
  if(!device||!device.song) return;
  var secs=device.song.sections;
  if(fromIndex>=0&&fromIndex<secs.length&&toIndex>=0&&toIndex<secs.length&&fromIndex!==toIndex){
    var sec=secs.splice(fromIndex,1)[0];
    secs.splice(toIndex,0,sec);
    songReindex();
    if(typeof renderTimelineFor==="function") renderTimelineFor(device);
    if(typeof setStatus==="function") setStatus("Section moved","ok");
  }
}

function songDuplicateSection(index){
  if(!device||!device.song) return;
  var secs=device.song.sections;
  if(index>=0&&index<secs.length){
    var copy=JSON.parse(JSON.stringify(secs[index])); // same canonical name -> valid mappings
    secs.splice(index+1,0,copy);
    songReindex();
    if(typeof renderTimelineFor==="function") renderTimelineFor(device);
    if(typeof setStatus==="function") setStatus("Section duplicated: "+copy.name,"ok");
  }
}

function songResizeSection(index,delta){
  if(!device||!device.song) return;
  var secs=device.song.sections;
  if(index>=0&&index<secs.length){
    var b=Math.max(4,Math.min(64,secs[index].bars+delta));
    if(b!==secs[index].bars){
      secs[index].bars=b;
      songReindex();
      if(typeof renderTimelineFor==="function") renderTimelineFor(device);
      if(typeof setStatus==="function") setStatus(secs[index].name+" -> "+b+" bars","ok");
    }
  }
}

function songReset(){
  if(!device) return;
  if(typeof buildSong==="function"){
    device.song=buildSong(device.seed);
    device._barCacheKey=-1;
    if(typeof renderTimelineFor==="function") renderTimelineFor(device);
    if(typeof setStatus==="function") setStatus("Arrangement reset from seed","ok");
  }
}


/* ============================================================
   ARRANGEMENT TEMPLATES (session 29)
   The fixed 7-section demo structure is no longer the only option.
   Real psytrance arrangements as loadable starting points, plus a
   blank canvas. Combined with the ARRANGE editor this becomes a
   real composition workflow: pick a structure (or blank), sculpt it.
   ============================================================ */

var ARRANGEMENT_TEMPLATES={
  "Full-On Classic":[["INTRO",32],["BUILD",16],["DROP",32],["BREAK",32],["RISER",8],["DROP2",32],["OUTRO",24]],
  "Progressive":[["INTRO",32],["BUILD",32],["DROP",32],["BREAK",16],["BUILD",16],["DROP2",48],["OUTRO",32]],
  "Dark Forest":[["INTRO",16],["BUILD",16],["DROP",32],["BREAK",16],["DROP2",32],["OUTRO",16]],
  "Hypnotic":[["INTRO",32],["DROP",48],["BREAK",16],["DROP2",48],["OUTRO",32]],
  "Blank Canvas":[["DROP",16]]
};

function loadArrangementTemplate(name){
  if(typeof device==="undefined"||!device||!device.song) return;
  var tpl=ARRANGEMENT_TEMPLATES[name];
  if(!tpl) return;
  var secs=[];
  for(var i=0;i<tpl.length;i++){ secs.push(songSectionDefaults(tpl[i][0],tpl[i][1])); }
  device.song.sections=secs;
  songReindex();
  if(typeof arrSel!=="undefined") arrSel=0;
  if(typeof renderTimelineFor==="function") renderTimelineFor(device);
  if(typeof selectSection==="function") selectSection(0);
  if(typeof setStatus==="function") setStatus("ARRANGEMENT: "+name+" ("+device.song.totalBars+" bars)","ok");
  if(typeof commitUndo==="function") commitUndo();
}


/* Session 30: RETHeme - regenerate all melodic themes with a fresh seed,
   keeping structure (root, modes, drop2 offset) and patterns intact.
   Gives real melodic variety without losing the arrangement. */
function retheme(){
  if(typeof device==="undefined"||!device||!device.song) return;
  var song=device.song;
  var newSeed=(Math.random()*4294967296)>>>0;
  song.themes={
    A:buildTheme(newSeed,"A",song.root+24,song.modes.drop),
    A2:buildTheme(newSeed,"A2",song.root+24+(song.drop2RootOffset||0),song.modes.drop2,{deriveFrom:"A"}),
    B:buildTheme(newSeed,"B",song.root+24,song.modes.break,{register:-12,emotional:true}),
    transition:buildTransitionTheme(newSeed,song.root+24,song.modes.intro)
  };
  device._barCacheKey=-1; // invalidate lead cache so new themes are heard
  if(typeof setStatus==="function") setStatus("MELODIES RETHEMED","ok");
  if(typeof trackEvent==="function") trackEvent("retheme",{});
  if(typeof commitUndo==="function") commitUndo();
}

function songGetInfo(){
  if(!device||!device.song) return null;
  return {
    sections: device.song.sections.length,
    totalBars: device.song.totalBars,
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
    
    // R: WAV export - 4 bars from the playhead (Phase 4; README shortcut promise)
    if (key === 'r' && !e.ctrlKey && !e.metaKey) {
      if (typeof renderWav === 'function') renderWav(4);
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
    
    // Phase 2: bank format v2 stores patterns + takeover flags together
    this.banks[bank] = {
      v: 3, // Phase 2 BarPlan: + per-section pattern overrides
      patterns: JSON.parse(JSON.stringify(device.patterns)),
      edited: JSON.parse(JSON.stringify(device.patternEdited || { bass:false, lead:false })),
      sectionPatterns: JSON.parse(JSON.stringify(device.sectionPatterns || {}))
    };
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
        var parsed = JSON.parse(saved);
        this.banks[bank] = parsed;
        // Phase 2: v2 banks carry takeover flags; legacy banks are raw patterns
        if (parsed && (parsed.v === 2 || parsed.v === 3) && parsed.patterns) {
          device.patterns = JSON.parse(JSON.stringify(parsed.patterns));
          device.patternEdited = parsed.edited ? JSON.parse(JSON.stringify(parsed.edited)) : { bass:false, lead:false };
          device.sectionPatterns = parsed.sectionPatterns ? JSON.parse(JSON.stringify(parsed.sectionPatterns)) : {}; // BarPlan (v3); v2/legacy -> none
        } else {
          device.patterns = JSON.parse(JSON.stringify(parsed));
          device.patternEdited = { bass:false, lead:false };
          device.sectionPatterns = {};
        }
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

/* ============================================================
   WAV EXPORT (Phase 4) - offline rendering
   Renders `bars` bars from the playhead through a DISPOSABLE
   Groovebox clone on an OfflineAudioContext (live device and its
   graph are never touched), encodes 16-bit PCM WAV, downloads.
   Delivers the README promise: "WAV Export - Offline rendering".
   ============================================================ */
var __wavBusy=false;
function encodeWav(audioBuffer){
  var numCh=audioBuffer.numberOfChannels, sr=audioBuffer.sampleRate, len=audioBuffer.length;
  var bytes=44+len*numCh*2;
  var ab=new ArrayBuffer(bytes), v=new DataView(ab);
  function wstr(off,s){ for(var i=0;i<s.length;i++) v.setUint8(off+i,s.charCodeAt(i)); }
  wstr(0,"RIFF"); v.setUint32(4,bytes-8,true); wstr(8,"WAVE"); wstr(12,"fmt ");
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,numCh,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*numCh*2,true); v.setUint16(32,numCh*2,true); v.setUint16(34,16,true);
  wstr(36,"data"); v.setUint32(40,len*numCh*2,true);
  var chs=[],c,i;
  for(c=0;c<numCh;c++) chs.push(audioBuffer.getChannelData(c));
  var off=44;
  for(i=0;i<len;i++){
    for(c=0;c<numCh;c++){
      var x=Math.max(-1,Math.min(1,chs[c][i]));
      v.setInt16(off, x<0 ? x*0x8000 : x*0x7FFF, true); off+=2;
    }
  }
  return new Blob([ab],{type:"audio/wav"});
}
function downloadBlob(blob,name){
  var a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); if(a.parentNode) a.parentNode.removeChild(a); },1000);
}
function renderWav(bars){
  bars=Math.max(1,Math.min(32,bars||4));
  if(__wavBusy){ if(typeof setStatus==="function") setStatus("EXPORT ALREADY RUNNING","err"); return Promise.resolve(); }
  if(typeof device==="undefined"||!device){ return Promise.resolve(); }
  if(typeof OfflineAudioContext==="undefined"){ if(typeof setStatus==="function") setStatus("OFFLINE RENDER NOT SUPPORTED","err"); return Promise.resolve(); }
  __wavBusy=true;
  if(typeof setStatus==="function") setStatus("RENDERING "+bars+" BARS...","ok");
  var sr=44100;
  var g=new Groovebox(); // disposable clone: live device untouched
  g.seed=device.seed; g.song=device.song;
  g.patterns=JSON.parse(JSON.stringify(device.patterns));
  g.sectionPatterns=JSON.parse(JSON.stringify(device.sectionPatterns||{})); // BarPlan
  g.patternEdited=JSON.parse(JSON.stringify(device.patternEdited||{bass:false,lead:false}));
  g.knobVals=JSON.parse(JSON.stringify(device.knobVals));
  g.mutes=JSON.parse(JSON.stringify(device.mutes));
  g.genre=device.genre||"FULL-ON";
  g.bpm=device.bpm; g.swing=device.swing;
  g.suppressMidi=true; // Phase 4: no MIDI emission during offline render
  var baseBar=Math.floor((device.absStep||0)/16);
  var sd=60/g.bpm/4;
  var total=bars*16*sd+2.5; // tail for delay/reverb release
  var octx=new OfflineAudioContext(2,Math.ceil(sr*total),sr);
  return g.init(octx).then(function(){
    g.updateDelayTime(); // dotted-eighth delay at the export BPM
    g.applyKnob("filter"); g.applyKnob("res");
    var start=0.05, n=bars*16;
    for(var i=0;i<n;i++){
      g.scheduleStep(baseBar*16+i, start+i*sd);
    }
    return octx.startRendering();
  }).then(function(buf){
    var blob=encodeWav(buf);
    downloadBlob(blob,"psy3-"+Math.round(g.bpm)+"bpm-bar"+(baseBar+1)+"-"+bars+"bars.wav");
    if(typeof setStatus==="function") setStatus("WAV EXPORTED: "+bars+" BARS","ok");
    if(typeof trackEvent==="function") trackEvent("wav_export",{bars:bars});
    __wavBusy=false;
    return blob;
  }).catch(function(e){
    __wavBusy=false;
    if(typeof setStatus==="function") setStatus("EXPORT FAILED","err");
    console.log("WAV export failed:",e);
  });
}


/* ============================================================
   LIVE RECORDING (Phase 4) - MediaRecorder off the post-master tap
   README promise: "Live Recording - MediaRecorder". Records the
   final bus (post-limiter) to webm audio; REC button toggles.
   ============================================================ */
function startRecording(){
  if(typeof device==="undefined"||!device||!device.ctx){ if(typeof setStatus==="function") setStatus("AUDIO NOT STARTED","err"); return; }
  if(device.recorder){ if(typeof setStatus==="function") setStatus("ALREADY RECORDING","err"); return; }
  if(!device.recTap||typeof MediaRecorder==="undefined"){ if(typeof setStatus==="function") setStatus("RECORDING NOT SUPPORTED","err"); return; }
  var mime=(MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported("audio/webm"))?"audio/webm":"";
  try{ device.recorder=new MediaRecorder(device.recTap.stream, mime?{mimeType:mime}:undefined); }
  catch(e){ if(typeof setStatus==="function") setStatus("RECORDING NOT SUPPORTED","err"); return; }
  device.recChunks=[];
  device.recorder.ondataavailable=function(e){ if(e.data&&e.data.size) device.recChunks.push(e.data); };
  device.recorder.onstop=function(){
    var blob=new Blob(device.recChunks,{type:device.recorder.mimeType||"audio/webm"});
    var secs=Math.max(1,Math.round((Date.now()-device.recStarted)/1000));
    if(typeof downloadBlob==="function") downloadBlob(blob,"psy3-live-"+Math.round(device.bpm)+"bpm-"+secs+"s.webm");
    if(typeof setStatus==="function") setStatus("RECORDED "+secs+"s","ok");
    if(typeof trackEvent==="function") trackEvent("live_recording",{seconds:secs});
    device.recorder=null; device.recChunks=[];
  };
  device.recStarted=Date.now();
  device.recorder.start(1000); // 1s chunks: safe against tab throttling
  var rb2=(typeof $==="function")?$("recBtn"):null;
  if(rb2){ rb2.classList.add("rec-on"); rb2.textContent="\u25CF REC ON"; }
  if(typeof setStatus==="function") setStatus("RECORDING... press REC to stop","ok");
  if(typeof trackEvent==="function") trackEvent("recording_started",{});
}
function stopRecording(){
  if(typeof device!=="undefined"&&device&&device.recorder&&device.recorder.state!=="inactive"){
    device.recorder.stop();
    var rb2=(typeof $==="function")?$("recBtn"):null;
    if(rb2){ rb2.classList.remove("rec-on"); rb2.textContent="REC"; }
  }
}
function toggleRecording(){
  if(typeof device!=="undefined"&&device&&device.recorder){ stopRecording(); } else { startRecording(); }
}


/* ============================================================
   PRESET MANAGER UI (Phase 4)
   savePreset/loadPreset/deletePreset/listPresets existed with ZERO
   callers since the PSY6 copy (flagged in the first audit). Now
   surfaced: PRESETS transport button -> panel with save/load/delete.
   ============================================================ */
function renderPresetList(){
  var host=$("presetList"); if(!host) return;
  host.innerHTML="";
  var names=(typeof listPresets==="function")?listPresets():[];
  if(!names.length){
    var d=document.createElement("div");
    d.textContent="no presets yet";
    d.className="preset-empty";
    host.appendChild(d);
    return;
  }
  for(var i=0;i<names.length;i++){
    (function(nm){
      var row=document.createElement("div");
      row.className="preset-item";
      var lab=document.createElement("div");
      lab.textContent=nm;
      lab.className="preset-name";
      var lb=document.createElement("button"); lb.textContent="LOAD";
      lb.className="mini-btn";
      lb.addEventListener("click",function(){ if(typeof loadPreset==="function") loadPreset(nm); });
      var db=document.createElement("button"); db.textContent="DEL";
      db.className="mini-btn";
      db.addEventListener("click",function(){ if(typeof deletePreset==="function"){ deletePreset(nm); renderPresetList(); } });
      row.appendChild(lab); row.appendChild(lb); row.appendChild(db);
      host.appendChild(row);
    })(names[i]);
  }
}
function togglePresetPanel(){
  var p=$("presetPanel"); if(!p) return;
  var isOpen=(p.style.display==="block");
  p.style.display=isOpen?"none":"block";
  if(!isOpen&&typeof renderPresetList==="function") renderPresetList();
}


/* ============================================================
   PROJECTS (Phase 4) - full-project save/load via .psy.json files
   Final README phase-4 item: "Projects - Save/load .psy.json".
   A project captures everything that defines the current track:
   seed/variation, tempo/swing, knobs, mutes, genre, the pattern
   grid, BarPlan per-section overrides and takeover flags. The
   arrangement itself is rebuilt deterministically from the seed.
   ============================================================ */
function buildProjectObject(name){
  if(typeof device==="undefined"||!device) return null;
  return {
    format:"psy3-project", v:1,
    name:name||"Untitled", timestamp:Date.now(),
    seed:device.seed, variation:device.variation,
    bpm:device.bpm, swing:device.swing,
    knobVals:JSON.parse(JSON.stringify(device.knobVals)),
    mutes:JSON.parse(JSON.stringify(device.mutes)),
    genre:device.genre||"FULL-ON",
    patterns:JSON.parse(JSON.stringify(device.patterns)),
    sectionPatterns:JSON.parse(JSON.stringify(device.sectionPatterns||{})),
    patternEdited:JSON.parse(JSON.stringify(device.patternEdited||{bass:false,lead:false})),
    song:JSON.parse(JSON.stringify(device.song)),
    partLen:JSON.parse(JSON.stringify(device.partLen||{})),
    chance:JSON.parse(JSON.stringify(device.chance||{PERC:new Array(16).fill(1),ARP:new Array(16).fill(1)}))
  };
}
function saveProject(name){
  var proj=buildProjectObject(name);
  if(!proj) return;
  var blob=new Blob([JSON.stringify(proj,null,2)],{type:"application/json"});
  var safe=(proj.name||"psy3-project").replace(/[^\w\-]+/g,"_");
  if(typeof downloadBlob==="function") downloadBlob(blob,safe+".psy.json");
  if(typeof setStatus==="function") setStatus("PROJECT SAVED: "+proj.name,"ok");
  if(typeof trackEvent==="function") trackEvent("project_saved",{name:proj.name});
}
function applyProject(proj){
  if(typeof device==="undefined"||!device||!proj) return;
  if(typeof commitUndo==="function") commitUndo(); // undo restores the pre-load state
  device.seed=proj.seed; device.variation=proj.variation||1;
  device.bpm=proj.bpm; device.swing=proj.swing;
  if(proj.genre&&typeof device.setGenre==="function") device.setGenre(proj.genre);
  device.knobVals=JSON.parse(JSON.stringify(proj.knobVals));
  device.mutes=JSON.parse(JSON.stringify(proj.mutes));
  device.patterns=JSON.parse(JSON.stringify(proj.patterns));
  device.sectionPatterns=JSON.parse(JSON.stringify(proj.sectionPatterns||{}));
  if(proj.song){ device.song=JSON.parse(JSON.stringify(proj.song)); device._barCacheKey=-1; if(typeof renderTimelineFor==="function") renderTimelineFor(device); } // Session 26
  if(proj.partLen){ device.partLen=JSON.parse(JSON.stringify(proj.partLen)); } // Session 28
  if(proj.chance){ device.chance=JSON.parse(JSON.stringify(proj.chance)); } else if(proj.percProb){ device.chance={PERC:JSON.parse(JSON.stringify(proj.percProb)),ARP:new Array(16).fill(1)}; } // Session 34 (migrates Session 33)
  device.patternEdited=JSON.parse(JSON.stringify(proj.patternEdited||{bass:false,lead:false}));
  for(var key in device.knobVals){ device.applyKnob(key); }
  if(!proj.song&&typeof buildSong==="function"){ device.song=buildSong(device.seed); device._barCacheKey=-1; } // Session 34: don't clobber a restored arrangement
  if(typeof refreshSeqUi==="function") refreshSeqUi();
  if(typeof renderTimelineFor==="function") renderTimelineFor(device);
  if(typeof device.updateLcd==="function") device.updateLcd();
  if(device.ctx&&typeof device.refreshPartGains==="function") device.refreshPartGains(device.ctx.currentTime);
  if(typeof setStatus==="function") setStatus("PROJECT LOADED: "+(proj.name||"unknown"),"ok");
  if(typeof trackEvent==="function") trackEvent("project_loaded",{name:proj.name||"unknown"});
}
function loadProjectFromFile(file){
  if(!file) return;
  var rd=new FileReader();
  rd.onload=function(){
    try{
      var proj=JSON.parse(rd.result);
      if(!proj||proj.format!=="psy3-project"||!proj.patterns){
        if(typeof setStatus==="function") setStatus("NOT A PSY3 PROJECT FILE","err");
        return;
      }
      applyProject(proj);
    }catch(e){
      if(typeof setStatus==="function") setStatus("PROJECT LOAD FAILED","err");
      console.log("Project load failed:",e);
    }
  };
  rd.readAsText(file);
}
