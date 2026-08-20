




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
      v: 2,
      patterns: JSON.parse(JSON.stringify(device.patterns)),
      edited: JSON.parse(JSON.stringify(device.patternEdited || { bass:false, lead:false }))
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
        if (parsed && parsed.v === 2 && parsed.patterns) {
          device.patterns = JSON.parse(JSON.stringify(parsed.patterns));
          device.patternEdited = parsed.edited ? JSON.parse(JSON.stringify(parsed.edited)) : { bass:false, lead:false };
        } else {
          device.patterns = JSON.parse(JSON.stringify(parsed));
          device.patternEdited = { bass:false, lead:false };
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