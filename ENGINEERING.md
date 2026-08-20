# ENGINEERING.md — PSY3 Audit & Remediation Log

Living engineering record for this repository. **Rule: every claim here is verified
against the code (static analysis / AST / git history). No claim without evidence.**

## Status: Phase 0 (Emergency Stabilization) — Session 1 complete

## Verified critical defects (audit; line refs at time of audit)

1. **MIDI splice** — `MIDIInput` + `initMIDIInput` were nested *inside*
   `MIDILearn.clear()` (merge splice, old lines 279-352). MIDI never initialized;
   `MIDILearn.start()` had no callers; `MIDIInput.handleCC` called undefined
   `applyMacro()`. README's "MIDI In - Notes + CC (auto-learn)" was non-functional.
2. **Error handler inside `debounce`** — `window.onerror` + `unhandledrejection`
   listener trapped in `debounce()` body; installed only as a side effect of the
   single `debounce(...)` call.
3. **Duplicate keydown listeners** — two live handlers both handled SPACE / Ctrl+Z /
   Ctrl+S: SPACE while playing = stop+restart (transport could not stop), double
   undo, double save.
4. **Duplicate declarations** — `getSequencerState`/`applySequencerState` defined
   twice; DOM-based pair referenced nonexistent `.seq-step` class.
5. **Silent scheduler failure** — `catch(e){ }` swallowed all scheduling errors.
6. **Write-only subsystems (not yet fixed)**: `UndoRedo.push` never called;
   `loadPreset/listPresets/deletePreset/saveSettings/loadSettings` have no callers;
   `patterns.kick/bass/perc/lead/pad` never read by audio engine (only
   `patterns.arp`); ADAPTIVE brain writes `patterns.KICK` (wrong case - key does
   not exist); `ChordEngine.nextChord`, `Arpeggiator.nextNote`, `TrackControl.init`,
   `PolyBLEP`, `ZDFFilter`, `OversampledLowpass`, `Envelope`, `PolyBLEPOscillator`
   defined but never wired; genre presets unreachable (`window._genreSound` never
   set); `selfTest` returns hardcoded fake values; README's WAV export /
   MediaRecorder / MIDI Out / offline PWA have no implementation.

## Session 1 changes (app.js, this commit)

Surgical edits only; file re-verified with esprima AST after each edit
(30 structural checks, all pass).

| # | Fix | Verification |
|---|-----|--------------|
| 1 | `debounce` restored to pure utility; global error handler installed explicitly at top level | AST: debounce body = 2 statements; `window.onerror` top-level |
| 2 | Dead DOM-based `getSequencerState`/`applySequencerState` pair removed (later definitions already shadowed them) | AST: exactly one definition of each |
| 3 | MIDI splice repaired: `MIDIInput` + `initMIDIInput` extracted to top level; undefined `applyMacro()` call routed to `applyMIDIParam()`; default mapping C2..G2 to pads 1-8 added | AST: both symbols top-level; zero `applyMacro` calls |
| 4 | Keydown dedupe: pads listener keeps KEYMAP only; SPACE / Ctrl+Z / Ctrl+S owned solely by `KeyboardShortcuts` | 2 registrations; pads listener contains no `togglePlay` |
| 5 | `device.makePatterns` assignment guarded | string check |
| 6 | Scheduler `catch(e){}` logs once instead of swallowing forever | string check |

### Deferred by plan (not by accident)

- Sequencer UI still ARP-only (`SEQ_EDIT=["ARP"]`); other parts arranger-driven -
  Phase 2 (unify pattern-vs-arranger ownership first).
- MIDI Learn has no UI trigger yet (`MIDILearn.start()` uncalled) - Phase 1.
- Preset load/list/delete, session restore, WAV export, MIDI out, undo/redo wiring -
  Phases 4/5.
- `PooledEngine` allocated-but-unused while live engine allocates per note -
  Phase 2 decision (pool properly or remove).

### Testing honesty

Verified by **static analysis only** (esprima parse + structural assertions).
No browser runtime test in this session. Required manual smoke test: SPACE stops
transport; MIDI device enumerates and C2..G2 trigger pads; error banner shows on fault.

## Phase plan

- **Phase 0 - Stabilization**: structural splices, input dedupe, silent failures. *(this session)*
- **Phase 1 - Modularization**: split 3.6k-line file into `core / compose / engine /
  fx / brain / io / ui` ES modules; single-file build preserved via bundler; kill the
  global `device` singleton (DI); command pattern => real undo/redo; MIDI Learn UI.
- **Phase 2 - Musical correctness**: single event pipeline (Section -> BarPlan ->
  StepEvents -> Voices); sequencer edits what is heard (6 rows); lead gate from note
  duration; HPF mode on DJ filter; real sidechain; master limiter; swing default 0.
- **Phase 3 - Brain**: grammar learning from real events; candidate-dependent
  fitness; brain modes exposed in UI.
- **Phase 4 - I/O**: WAV export (OfflineAudioContext), MediaRecorder, MIDI out +
  clock, preset manager, session restore, versioned schema.
- **Phase 5 - PWA/runtime**: real SW precache, missing icons, AudioWorklet scheduler
  (background-tab resilience), proper CSP.
- **Phase 6 - Testing**: unit (theory/rng/grammars), seeded-render golden snapshots,
  E2E checklist.

## Iron rules

1. A ROADMAP/README item closes only when a test or manual check passes.
2. No feature text in docs without a caller graph proving it is wired.
3. Every refactor guarded by a golden render of the seeded default song.
