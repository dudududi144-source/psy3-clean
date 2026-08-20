


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
  var known = { bpm:1, filter:1, res:1, drive:1, delay:1, reverb:1, swing:1, duck:1 }; // Phase 2: duck learnable
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