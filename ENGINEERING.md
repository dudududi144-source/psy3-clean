# ENGINEERING.md — PSY3 Audit & Remediation Log

Living engineering record for this repository. **Rule: every claim here is verified
against the code (static analysis / AST / git history). No claim without evidence.**

## Status: Phase 0 (Emergency Stabilization) — Session 3 complete

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

## Session 2 changes (this commit)

Goal: make MIDI Learn functional end-to-end (README: "MIDI In - Notes + CC (auto-learn)").

| # | Fix | Verification |
|---|-----|--------------|
| 1 | `applyMIDIParam` rewritten: all knob params route through `device.setKnob()` - the exact UI code path. The old version referenced nodes that were never created (delayMix/reverbMix) and a different filter node than the knobs use (autoFilter vs djFilter), so delay/reverb learn silently no-op'd. `resonance` kept as alias for `res`; `volume` stays a direct (guarded) master-gain write | AST parse + zero delayMix/reverbMix refs remain in code |
| 2 | MIDI Learn trigger: **right-click any knob** learns its parameter (dblclick keeps its existing reset-to-default role) | `MIDILearn.start()` now has a caller; contextmenu handler present |
| 3 | User feedback: status banner on learn start / CC mapped / cancel; learned param captured before `stop()` clears it | string checks |
| 4 | **Escape cancels MIDI learn** (KeyboardShortcuts) | clause present after enable check |
| 5 | `MIDIInput.init` idempotent (`requested` guard); re-armed on first pointerdown for browsers gating MIDI permission behind a gesture | guard + `{ once: true }` listener present |

### Behavioral notes (honest)

- BPM via MIDI CC now follows the UI knob range (120-165), not the old never-wired 60-200 mapping.
- Genre presets (DARK-PSY / PROGRESSIVE) remain unreachable **by decision** this session: wiring them
  requires voices to read config per-note (audio-layer surgery) - scheduled to Phase 2.
- Static verification only (esprima parse + structural assertions). Runtime smoke test required:
  right-click FILTER knob -> move a hardware CC -> knob follows; Escape cancels. Learned mappings
  persist until reload (ccMap persistence is Phase 4).


## Session 3 changes (this commit)

Goal: close the remaining Phase 0 crash/consistency items; make documented persistence and undo actually work.

| # | Fix | Verification |
|---|-----|--------------|
| 1 | **Double UI init removed**: the tail `safeInitUi` wiring duplicated the mid-file one; with an end-of-body script both fired, so `initUi()` ran twice (duplicate knobs/pads/seq rows, two click handlers on PLAY = one click toggled transport twice, two rAF loops). Tail block removed | `safeInitUi` appears exactly 3x in code (def + one listener + one immediate call) |
| 2 | **Undo/Redo wired**: `commitUndo()` helper added; called on step edits, on manual VARIATE, and once at boot (baseline). `getDeviceState` now snapshots `patterns` (previously missing, so undo could never restore edits); `applyDeviceState` restores them and refreshes the grid. Before this session `UndoRedo.push` had zero callers - Ctrl+Z was a silent no-op | push has callers; snapshot includes patterns; AST parse |
| 3 | **Crash guards**: `loadPreset` and `applyDeviceState` called `device.refreshPartGains(device.ctx.currentTime)` with no ctx check (TypeError before first play). All 4 callsites of that expression are now guarded | string check over comment-stripped code |
| 4 | **selfTest honesty**: hardcoded `{ok:true,rms:0.1,peak:0.5}` replaced with real structural checks (7 sections, totalBars>0, arp pattern length, themes.A, voice factory); live RMS measured only when ctx+analyser exist; failures reported via `reason` (already consumed by UI) | fake literal absent from code; UI contract (ok/rms/peak/reason) preserved |
| 5 | **Session restore wired**: `loadSettings()` existed but was never called; now invoked at device creation (try/catch) and rebuilds patterns/song from the restored seed for consistency. `saveSettings()` now also runs on preset save (Ctrl+S) | exactly one boot call site; rebuild lines present |
| 6 | **Dead ritual blocks removed** (empty `if`s saying "will be called after device is ready"); replaced by documented decisions: `TrackControl.init` must NOT be called (double-routes partGains, ~+6dB, bypasses BASS/PAD ducking); `PooledEngine.init` already runs inside `device.init()`; pool-vs-per-note engine decision is Phase 2 | string check |

### Honest notes

- Undo granularity: one snapshot per step edit / manual variate. Pattern ops (clear/random/shift/...) and song ops do not push snapshots yet - Phase 1 command pattern covers this properly.
- Settings snapshot does not include step edits; pattern persistence belongs to preset format v2 (Phase 4). Restoring a seed rebuilds the seed-derived arrangement.
- Static verification only (esprima parse + 42 structural checks, all pass). Runtime smoke: edit ARP steps -> Ctrl+Z restores; reload page -> BPM/knobs restored; SELF TEST line shows OK.


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
