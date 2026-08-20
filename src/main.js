

/* ============================================================
   BOOT SEQUENCE (Phase 1a)
   ALL top-level executable statements are consolidated here,
   in their ORIGINAL relative order. Everything above this line
   is declarations only (function decls, var/object config,
   Groovebox.prototype method definitions). This is the
   precondition for splitting the file into classic scripts /
   modules in Phase 1b: declaration files first, boot last.
   ============================================================ */


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

Grammars.init();
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
try{
  device=new Groovebox();
}catch(e){
  document.addEventListener("DOMContentLoaded",function(){
    var st=document.getElementById("status");
    if(st){st.textContent="DEVICE ERROR: "+e.message;st.style.color="#ff0044";st.style.fontSize="14px";}
  });
}
if(device){ device.makePatterns=makePatterns; } // Phase 0: guard (device undefined if ctor threw)
// Phase 0c: session restore — loadSettings existed but was never called.
try { loadSettings(); } catch (e) { console.log('loadSettings failed:', e); }
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
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",safeInitUi);
else safeInitUi();


// Fallback: hide loading after 5 seconds regardless
setTimeout(function() {
  hideLoading();
}, 5000);

// Replace existing keydown listener with enhanced version
window.removeEventListener('keydown', KeyboardShortcuts.handleKey);
window.addEventListener('keydown', function(e) {
  KeyboardShortcuts.handleKey(e);
});

// Load banks on startup
PatternBanks.loadAll();


/* ============================================================
   INITIALIZATION (must be at the end, after all functions defined)
   ============================================================ */

// Initialize UI when DOM is ready
// Phase 0c: duplicate safeInitUi wiring REMOVED. The block above (mid-file)
// already registers/invokes it. Having both meant initUi() ran twice:
// duplicated knobs/pads/seq rows, two click handlers on PLAY (one click
// toggled transport twice) and two rAF loops.

// Initialize MIDI input
if (typeof initMIDIInput === 'function') {
  initMIDIInput();
  // Phase 0b: re-arm on first gesture for browsers that gate MIDI
  // permission behind user interaction (init is idempotent).
  window.addEventListener('pointerdown', function() { initMIDIInput(); }, { once: true });
}

// Phase 0c: two empty "will be called after device is ready" if-blocks
// were removed here. Decisions, documented instead of ritually deferred:
//  - TrackControl.init is intentionally NOT called: it would double-route
//    every partGain (already connected to master/duck), adding ~6dB and
//    bypassing ducking for BASS/PAD. Revisit in Phase 2 with single routing.
//  - PooledEngine.init IS already called inside device.init(). The pool is
//    allocated but unused by the live (per-note) engine — Phase 2 decides
//    between wiring the pool properly or removing it.

console.log('PSY3 PRO initialized');
