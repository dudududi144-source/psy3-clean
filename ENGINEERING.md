# ENGINEERING.md — PSY3 Audit & Remediation Log

Living engineering record for this repository. **Rule: every claim here is verified
against the code (static analysis / AST / git history). No claim without evidence.**

## Status: Phase 5 - Session 18: offline PWA (real precache + icons)

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


## Session 4 changes (this commit) — Phase 1a complete

Goal: consolidate ALL top-level executable statements into a single marked BOOT block at the end of the file, in their original relative order. Everything above is now declarations only (function declarations, config objects, `Groovebox.prototype.*` method definitions). This is the verified precondition for splitting the file into separate script files / modules in Phase 1b.

| # | Change | Verification |
|---|--------|--------------|
| 1 | 16 immediate-exec statements relocated to BOOT: `window.onerror`, `unhandledrejection` listener, `Grammars.init()`, hitPad/scheduleStep hooks, device creation + `makePatterns` guard + `loadSettings()`, pads keydown listener, `safeInitUi` wiring, loading fallback `setTimeout`, KeyboardShortcuts remove/add listener pair, `PatternBanks.loadAll()`, MIDI init, init log | AST: statement multiset byte-identical before/after (202 stmts); boot block == moved statements in original relative order; zero immediate-exec statements remain above BOOT; parse OK |

### Why this is behavior-preserving (verified reasoning)

- Only statement ORDER changed; every top-level statement kept byte-for-byte (multiset check).
- Cross-references of moved statements at load time resolve identically: function declarations hoist across the whole script; all `var` config objects referenced by boot statements (Grammars, grammarTracker, KEYMAP, KeyboardShortcuts, PatternBanks, MIDIInput) remain above the boot block.
- The `document.readyState` check for `safeInitUi` still runs during parsing (end-of-body script), so its outcome is unchanged.
- Event listeners and timers only fire after full script execution, so their later registration is observationally identical.

### Honest notes

- `Groovebox.prototype.*` assignments are technically executable statements; they are intentionally left in place (they execute nothing at load time beyond binding methods). In Phase 1b they move into the engine module file.
- Static verification only (esprima + 39 structural/semantic checks, all pass). Runtime smoke: page loads, PLAY works, SELF TEST shows OK, MIDI device enumerates.


## Session 5 changes (this commit) — Phase 1b complete

The 3.6k-line `app.js` monolith is now physically split into 9 files under `src/`, loaded in order by `index.html`. **`app.js` was deleted after the split** — its exact contents live on in the split files.

| File | Lines | Contents |
|---|---|---|
| `src/core.js` | 30 | debounce/throttle utilities |
| `src/pools.js` | 120 | BufferPool, VoicePool, UndoRedo + doUndo/doRedo |
| `src/midi.js` | 203 | MIDILearn, MIDIInput, initMIDIInput, applyMIDIParam, triggerMIDIAction |
| `src/theory.js` | 282 | `$`, scales/theory, RNG, makePatterns, makeNoiseBuffer, makeVoices |
| `src/song.js` | 239 | sections/themes/bass-styles/energy curves, STYLE, GENRE_SOUND_CONFIG |
| `src/engine.js` | 1464 | Groovebox ctor + all prototype methods, PooledEngine, DSP objects, Grammars, CandidateGenerator, TrackControl, ChordEngine |
| `src/ui.js` | 315 | knobs/seq/pads/viz/timeline, initUi/safeInitUi, transport UI |
| `src/editor.js` | 842 | Arpeggiator, presets/settings/state, pattern & song ops, mobile, KeyboardShortcuts, PatternBanks |
| `src/main.js` | 170 | the Phase 1a BOOT block (all 16 top-level executable statements) |

### Verification (the important part)

- **Byte-exact equivalence**: concatenating the 9 files in load order reproduces the pre-split `app.js` **byte for byte** (`concat == original` evaluated True). Nothing was lost, added, or reordered.
- Each file parses standalone (esprima); files 1-8 contain zero immediate-execution statements (function/var declarations and `Groovebox.prototype.*` bindings only) — the Phase 1a invariant, re-verified per file.
- `src/main.js` contains exactly the 16 boot statements; all boot dependencies (Grammars, hitPad, Groovebox, loadSettings, KEYMAP, KeyboardShortcuts, PatternBanks, MIDIInput) are declared in earlier files; function declarations hoist per-file and resolve at runtime.
- All session 1-4 regression markers verified over the concatenation.
- Push order kept the site working at every commit: src files first, then index.html switch-over, then app.js deletion.

### Honest notes

- This is a **contiguous** split (boundaries at natural section lines), not a layer-pure regrouping — `src/engine.js` still mixes engine + brain code, and theory/voices share a file. Layer-pure modules (moving declarations across file order) need a dependency-order proof + runtime test = Phase 1c/2.
- `src/engine.js` at 1464 lines is the next decomposition target.
- Static verification only. Runtime smoke test required: page loads, PLAY works, knobs/pads respond, MIDI enumerates, SELF TEST shows OK.


## Session 6 changes (this commit)

Two tracks this session: completing the engine decomposition (Phase 1b follow-up) and two concrete musical/UI improvements that were documented-but-missing.

### 1. `src/engine.js` decomposed into 3 files

| File | Lines | Actual contents |
|---|---|---|
| `src/groovebox.js` | 302 | Groovebox constructor, GENRE_SOUND_CONFIG, cfg()/early prototypes, PART_COLORS/PART_NAMES, PooledEngine |
| `src/dsp.js` | 272 | PolyBLEP, ZDFFilter, BrickwallLimiter, OversampledLowpass, Envelope, SoftClip (all still unwired - Phase 2 decision pending) |
| `src/brain-runtime.js` | 892 | Grammars, grammarTracker, CandidateGenerator, TrackControl, ChordEngine, pooled triggers, `var device`, and the bulk of Groovebox.prototype methods (init/FX graph/transport/scheduler/LCD/selfTest) |

- **Byte-exact proof**: split parts + reverted session-6 swing edits == original `engine.js`, byte for byte.
- Each file parses standalone; zero immediate-execution statements outside `Groovebox.prototype.*` bindings (Phase 1a invariant).
- `src/engine.js` deleted after `index.html` switch-over (site working at every intermediate commit).
- Honest naming note: `brain-runtime.js` mixes brain code with runtime prototypes because the split is contiguous; layer-pure separation remains deferred (needs dependency-order proof + runtime test).

### 2. Pattern Banks UI (documented feature, had no UI)

`PatternBanks` (A-D, localStorage-persisted, `loadAll()` at boot) existed since the PSY6 copy but had zero callers for `save()`/`load()`. Added `buildBanks()` in `src/ui.js` (called from `initUi`): 4 bank buttons under the sequencer - **click = load bank, shift+click = save current patterns**, with status feedback (existing PatternBanks messages) and an undo snapshot pushed after each load. No audio-path changes.

### 3. Swing default: 0.20 -> 0 (musical correctness, Phase 2 first item)

Psytrance groove is straight; the previous default added ~6% 16th偏移 via three places that are now consistent:
constructor `this.swing`, constructor `knobVals.swing`, and `KNOB_DEFAULTS.swing` (all 0 now). The knob remains for deliberate swing/humanize. (Wording fixed in code comment; knob range unchanged.)

### Verification

- 21 structural/semantic markers pass (split equivalence, swing consistency, banks wiring, all session 1-5 regressions).
- Static verification only. Runtime smoke: page loads, BANK buttons load/save ARP patterns, swing knob still works.


## Session 7 changes (this commit) — Phase 2 first slice: the sequencer becomes audible

The step sequencer now drives the engine for 4 of 6 parts. Previously only `patterns.arp` was read by `scheduleStep`; kick/percussion/pads came from hardcoded constants and inline logic, so editing their patterns (or storing them in banks) had no sonic effect.

| Part | Before | Now |
|---|---|---|
| KICK | hardcoded `KICK_STEPS=[0,4,8,12]` | `patterns.kick[step]` (seeded default = four-on-the-floor, sonically identical) |
| PERC | inline per-step logic with per-bar RNG | `patterns.perc[step]` (`clap/shaker/oh`), deterministic per seed; clap energy gate preserved; section fills + crash unchanged |
| PAD | hardcoded `[bassRoot+12,+19,+24]` at step 0 of even bars | `patterns.pad[step].chord` offsets (seeded default `{chord:[0,7,12]}` = exactly the old voicing) |
| ARP | already pattern-driven | unchanged |
| BASS / LEAD | section styles / themes | **unchanged by design** - they remain arrangement-driven until the BarPlan architecture (per-section patterns); no fake rows in the UI |

Other changes:

- **UI**: `SEQ_EDIT` now shows 4 rows (KICK, PERC, ARP, PAD). Honesty rule applied: a row is shown only if it is both editable AND audible.
- **ADAPTIVE brain bug fixed**: it wrote to `patterns.KICK` (uppercase) - a key that never existed in `makePatterns` output (lowercase keys), so the write silently no-op'd. Now writes `patterns.kick`.
- **Pad chord consistency**: `toggleStep` PAD default and seeded `makePatterns` pad chord were `[0,4,7]` (root/third/fifth) while the runtime actually voiced `[0,7,12]` (root/fifth/octave, modal no-third). All three sites now agree on `[0,7,12]`.

### Behavioral notes (honest)

- Odd-step shakers are now seeded-deterministic (pattern) instead of per-bar random (`barRng`) - tighter, reproducible groove.
- `variate()` (manual or per 176-bar cycle) regenerates patterns from the new seed - kick/perc/pad edits reset, same as ARP always did. Pattern persistence across variations belongs to Phase 4.
- Bank save/load now meaningfully covers 4 audible parts.
- Static verification only (esprima parse of all 4 edited files + 25 structural/semantic markers, all pass). Runtime smoke: toggle a KICK step off -> hear the gap; add PERC steps; PAD chord edits audible on even bars.


## Session 8 changes (this commit) — Phase 2: BASS/LEAD takeover

All 6 sequencer rows are now visible, and BASS/LEAD become editable WITHOUT breaking the arrangement engine, via an explicit takeover mechanism:

- `device.patternEdited = {bass:false, lead:false}` (constructor). While false, the section bass styles and lead themes drive the music exactly as before (byte-identical code path, now inside an `else` branch).
- **First user edit of a BASS/LEAD step takes the part over**: the flag flips, the row becomes authoritative and audible (`patterns.bass` entries {n: semitone offset from section bassRoot, s?: sustain}; `patterns.lead` entries {deg,dur,accent|acc,rest} mapped through SCALE_EXT at ROOT+24 with the existing accent/slide logic).
- **Ghost UX (honesty)**: while arrangement-driven, BASS/LEAD rows render dimmed (opacity .45) with a tooltip 'arrangement-driven - click a step to take over'. Visible==editable==audible remains true in BOTH states, and the state itself is visible - no more write-only grids.
- Flags reset to arrangement control on `variate()` (reseed) and `loadSettings()` (session restore).
- **Banks v2**: PatternBanks save/load now persist patterns + takeover flags (`{v:2, patterns, edited}`); legacy raw-pattern banks still load (treated as arrangement-driven).
- **Undo/redo**: `getDeviceState`/`applyDeviceState` snapshot and restore the flags, so Ctrl+Z returns a taken-over part to its exact prior state.

### Verification

- All 4 edited files parse (esprima); 26 structural/semantic markers pass (the single reported failure was a wrong-scope check in the harness - the ADAPTIVE hook lives in main.js, verified intact on remote).
- Arrangement code paths preserved verbatim inside else branches (bass styles, theme cache/cursor logic).
- Static verification only. Runtime smoke: BASS/LEAD rows appear dimmed; click a BASS step -> row brightens and the edited note plays; Ctrl+Z restores; bank save/load round-trips takeover state.


## Session 8b changes (this commit) — on top of the BASS/LEAD takeover

Context: five takeover commits (patternEdited flags, scheduler takeover with arrangement else-branches, 6-row UI with ghost UX, banks v2, docs) landed from a parallel workstream after session 7. Session 8b builds on that state; all takeover mechanics re-verified intact after these edits.

| # | Change | Verification |
|---|--------|--------------|
| 1 | **Lead gate**: `leadNote()` supports `opts.gate` (seconds). Theme path passes `ev.dur*sd*0.92`; takeover path passes `(lpe.dur||1)*sd*0.92`. Without a gate the legacy fixed 240ms envelope is reproduced exactly (arp/pad/pad-trigger sounds unchanged); filter-close ramp and oscillator stop scale with the gate | AST parse; both envelope branches present; legacy ramp string intact |
| 2 | **HPF DJ filter mode**: `filterMode` LP (default; exactly the legacy curve `80*225^(v^2)`) / HP (`20*1000^((1-v)^2)` - sweeps the lows out, the DJ half psy sets need). BiquadFilter type switches at runtime; UI label-button under the FILTER knob (click toggles, shows current mode); `toggleFilterMode()` prototype method with status + analytics | parse; both curves and type-switch strings present; default LP = zero behavior change until toggled |

### Honest notes

- Lead sustain changes the sonic character of themes **by design**: notes now hold for their written length instead of a fixed 240ms. This cannot be verified without a listening test.
- Takeover-edited lead notes sustain too (dur taken from the edited entries).
- Static verification only (29 structural/semantic markers, all pass). Runtime smoke: toggle LP/HP and sweep the filter; long theme notes should sustain; edited BASS/LEAD rows still take over on first edit.


## Session 9 changes (this commit) — genre presets finally wired

`GENRE_SOUND_CONFIG` shipped with three presets (FULL-ON / DARK-PSY / PROGRESSIVE) but was unreachable (selection read `window._genreSound`, which nothing ever set - flagged in the original audit). Now:

| # | Change | Verification |
|---|--------|--------------|
| 1 | `makeVoices` takes a `getCfg` thunk; the five pitched voices (kick/bass/lead/arp/pad) read config **per note**, so a genre switch applies from the next note. Drum voices untouched (they don't read cfg) | AST parse; per-function cfg use/declaration consistency checked for all 10 voice functions (5 use + declare, 5 neither) - zero ReferenceError potential |
| 2 | `cfg()` reads `this.genre` via `GENRE_SOUND_CONFIG`, with `window._genreSound` kept as legacy fallback | string check |
| 3 | `setGenre(name)` / `cycleGenre()` prototype methods; constructor default `FULL-ON`; LCD reflects the genre via `STYLE.name` | definitions present (note: `setGenre=function(name)`) |
| 4 | UI: **GENRE button** in the transport row (cycles the three presets, tooltip explains) | HTML + initUi wiring checks |
| 5 | Persistence: genre saved/restored in settings (session restore) and included in undo/redo state (applied without side effects during undo) | 4 string checks in editor.js |

What audibly changes per genre (from the config values, verified in code): bass wave/cutoff/resonance/level, lead/arp cutoff/resonance/level, pad level/cutoff, and the kick pitch sweep (FULL-ON 150->55Hz, DARK-PSY 120->45Hz - deeper, PROGRESSIVE 180->60Hz).

### Known gap (honest)

Six config params remain unused by the voice code: `kickDecay, kickPunch, hatFreq, hatDecay, percTune, percDecay` - drum voices still use hardcoded values. Wiring them is further drum-voice surgery; deferred and documented here instead of silently claiming completeness.

### Verification

- All 6 edited files parse (esprima); 24 structural markers pass (one marker 'failure' during the session was my own typo - `setGenre=function(){` vs the actual `setGenre=function(name){` - re-verified correct).
- Static verification only. Runtime smoke: click GENRE mid-play -> bass/lead character and kick depth change immediately; reload restores genre; undo restores it too.


## Session 10 changes (this commit) — master-chain completion + genre drums

### 1. Brickwall limiter wired into the master chain

The `BrickwallLimiter` object shipped in `src/dsp.js` but was never connected. Now the chain is:

`master -> autoFilter -> djFilter -> drivePre -> shaper -> drivePost -> comp(-14dB/5:1) ->` **`BrickwallLimiter(-1dB, 20:1, hard knee, 1ms attack, 50ms release) -> makeup(1.0)`** `-> analyser -> destination`

- The analyser stays LAST, so `getEnergy()`, selfTest and the viz measure the final (limited) output.
- Guarded: if `BrickwallLimiter` is missing the chain falls back to the old comp->analyser connection.
- The legacy never-called `initBrickwallLimiter()` / `initSoftClipOutput()` functions remain as dead code; removal deferred to a cleanup pass so this commit stays minimal.

### 2. Genre drums — the session-9 known gap is closed

All six previously-unused config params are now live in the drum voices (per-note, like the pitched voices):

| Param | Voice | Mapping | FULL-ON default = old hardcoded value |
|---|---|---|---|
| `kickDecay` | kick body | gain ramp + osc stop (`kd+0.03`) | 0.10 -> identical ramp/stop |
| `kickPunch` | kick click | click gain level | 0.35 -> identical |
| `hatFreq` | shaker | HP cutoff = `hatFreq+200` | 8000 -> 8200 (old value) |
| `hatFreq` | open hat | HP cutoff = `hatFreq-800` | 8000 -> 7200 (old value) |
| `hatDecay` | shaker / open hat | `max(0.012, hatDecay+0.005)` / `max(0.03, hatDecay*5)` | 0.04 -> 0.045 / 0.2 (old values) |
| `percTune` | clap/snare | BP frequency multiplier (1500/1900/185 * tune) | 1.0 -> identical |
| `percDecay` | clap/snare | decay time scale `(percDecay/0.08)` | 0.08 -> scale 1.0 (identical) |

Also fixed: `cfg()`'s `percDecay` fallback was `.4` (inconsistent with every preset); now `.08`.

Per-function cfg use/declaration matrix re-verified for all 10 voice functions (9 now read cfg via `getCfg()`, crash stays cfg-free as it uses a pre-rendered buffer). FULL-ON reproduces the pre-change drum sound exactly by construction (arithmetic above); DARK-PSY gets deeper kick (120->45Hz was already wired, now +longer decay, darker hats), PROGRESSIVE tighter/brighter.

### Verification / honesty

- AST parse of all 3 edited files; 23 structural markers pass; cfg matrix PASS.
- The limiter changes peak behavior by design (peaks clamped near -1dB) - loudness/safety improvement, not verifiable without listening.
- Static verification only. Runtime smoke: play at high drive -> no clipping artifacts; switch genres -> drum character changes (kick depth/length, hat brightness, clap/snare tuning).


## Session 11 changes (this commit) — dead-code excision + controllable sidechain

### 1. Verified-dead code removed (rule: wire it or delete it)

- `PooledEngine` (banner + object) + `initPooledEngine()` + its call in `Groovebox.init()`: the pool allocated 44 always-on silent voices (oscillators running, connected to master at gain 0) and was never triggered by any note path - pure DSP/CPU waste. Zero callers verified before removal.
- `triggerDrumWithPool` / `triggerSynthWithPool` / `panicAllVoices`: zero callers, removed.
- `initSoftClipOutput()` / `initBrickwallLimiter()`: never called; limiter is wired directly in `Groovebox.init()` since session 10, drive stage uses its own tanh WaveShaper. Removed.
- `SoftClip` object + stale 'Initialize PooledEngine' comment in dsp.js: removed.
- Post-removal scan strips BOTH `//` and `/* */` comments, then asserts zero references for all 8 symbols.
(First pipeline attempt aborted itself when a `/* */` banner mention was detected - the guard worked as designed.)

### 2. Sidechain depth is now a user control

- New `DUCK` knob (8th knob): maps v to duck depth `1 - v*0.8` (v=0 -> no ducking, v=1 -> deep 0.2).
- `device.duckDepth` default 0.40 = exactly the previous hardcoded value (legacy sound preserved).
- Kick-triggered duck automation in `scheduleStep` reads `duckDepth`; release timing unchanged.
- Persisted via knobVals (presets/settings/undo automatically) and learnable via MIDI CC.

### Verification / honesty

- All 5 edited files parse; dead-symbol scan clean; limiter/genre/gates/HPF/takeover regressions asserted.
- Removing the silent pool changes no audible signal (voices never triggered, gain 0).
- Static verification only. Runtime smoke: DUCK knob audible on bass/pad pumping; knob restores with presets.


## Session 12 changes (this commit) — BarPlan: per-section pattern ownership

The last Phase-2 editing feature: each song section can now own its pattern grid.

### Model (lazy ownership, zero behavior change until first edit)

- `device.sectionPatterns = { SECTION_NAME: patternsClone }` - populated lazily.
- `patternsFor(sectionName)`: scheduler reads the section's own patterns if it was edited, otherwise falls back to the global seeded patterns. All six lanes routed through it (kick, takeover-bass, perc, takeover-lead, arp, pad).
- `activePatterns()`: grid-edit target = the section at the playhead; first edit clones the global baseline into that section's slot (then mutates the clone).
- `onBar` section change refreshes the grid, so the displayed pattern follows the playing section.
- `variate()` clears overrides (new variation = fresh baseline). Undo/redo state and banks include them.

### Banks v3 + compatibility

- Save format v3 = `{v:3, patterns, edited, sectionPatterns}`. Loader accepts v3, v2 (no overrides -> `{}`) and legacy raw-pattern banks. Old saved banks load unchanged.

### Semantics notes (honest)

- BASS/LEAD takeover flags stay global: once you edit bass anywhere, bass becomes pattern-driven in all sections (unedited sections read the global seeded gallop). Per-section bass STYLE (offbeat/pedal) is superseded by design once patterns take over.
- Pattern ops (clear/random/shift/...) still act on the global patterns object, not per-section - documented limitation; section-scoped ops are a follow-up.
- Static verification only (AST parse + structural assertions, incl. all session 1-11 regressions). Runtime smoke: edit ARP in DROP, seek to BREAK -> grid differs; playback plays each section's own steps; save/load bank A preserves per-section edits; undo restores them.


## Session 13 changes (this commit) - Phase 4 begins: WAV export (offline rendering)

The README promised "WAV Export - Offline rendering" since day one; until now there was no `OfflineAudioContext`, encoder, or download path anywhere. Now:

### Implementation

- `Groovebox.init(extCtx)` accepts an external context. Live behavior unchanged (no arg -> `new AudioContext()`); the brickwall limiter stays live-only (its singleton is ctx-bound).
- `renderWav(bars)` (editor.js): builds a **disposable Groovebox clone** (deep-copied patterns, sectionPatterns/BarPlan, takeover flags, knobVals, mutes, genre, bpm, swing), initializes it on a 44.1kHz stereo `OfflineAudioContext`, schedules `bars*16` steps starting at the playhead bar, renders, encodes, downloads. The live device and its audio graph are never touched. +2.5s tail for delay/reverb release. Busy-guard prevents overlapping renders.
- `encodeWav`: canonical RIFF/WAVE 16-bit PCM interleaved encoder. `downloadBlob` handles the anchor click + object-URL cleanup.
- Triggers: **R key** (the README documented shortcut) and a new **EXPORT** transport button; both export 4 bars (API clamps 1-32).

### Verification / honesty

- AST parse of all edited files; structural assertions (RIFF header, clone deep-copies, limiter live-only guard, BarPlan state copied, sessions 1-12 regressions).
- Known side effect: export scheduling runs the prototype hook (`grammarTracker.trackKick`), so the (currently inert) rhythm grammar observes exported bars. Acceptable; documented.
- Export quality note: offline path uses the glue compressor without the brickwall stage (limiter is live-only) - peaks behave slightly differently than live monitoring.
- Static verification only. Runtime smoke: press R mid-song -> file downloads; filename reflects BPM/bar/count; content plays back as the section at the playhead.


## Session 14 changes (this commit) - Phase 4: live recording (MediaRecorder)

Second README promise closed this phase: "Live Recording - MediaRecorder" (until now the string MediaRecorder appeared nowhere in the codebase).

### Implementation

- **Recording tap**: `Groovebox.init` adds `ctx.createMediaStreamDestination()` and connects the **analyser** to it - i.e. the recording captures the final master chain **post-limiter**. Guarded by feature detection, so OfflineAudioContext export clones skip it automatically.
- **Recorder engine** (editor.js): `startRecording/stopRecording/toggleRecording` wrap MediaRecorder with 1-second chunks (robust against background throttling), mime negotiation (`audio/webm` when supported), download-on-stop named `psy3-live-<bpm>-<seconds>s.webm`, busy/state guards and analytics.
- **UI**: REC transport button toggles recording; status line shows state and duration.
- Recorder state fields (`recorder/recChunks/recStarted`) live on the constructor.

### Verification / honesty

- AST parse of all 4 edited JS files; structural assertions (tap wiring single, MediaRecorder construction, chunk size, button wiring) + session 1-13 regressions (extCtx init, limiter live-only, WAV export, BarPlan, duck, takeover, genre).
- Output format is **webm/opus** (MediaRecorder's native container), not WAV - matches the README item's wording; WAV remains covered by the offline export path.
- Static verification only. Runtime smoke: press PLAY then REC -> status shows RECORDING; press REC again -> webm downloads and plays back the live mix.


## Session 15 changes (this commit) - Phase 4: MIDI Out + MIDI Clock

Last audio-I/O README promise closed: "MIDI Out - LEAD notes + MIDI Clock" (until now the codebase had MIDI **input** only - zero output code, no clock bytes).

### Implementation

- **MIDIOut module** (midi.js): port auto-selection (first available output, hot-plug via `onstatechange`), `send/clock/transportStart/transportStop/noteOn/noteOff` helpers, try-guarded.
- **Audio-to-MIDI time translation**: `audioToPerf(ctx,t)` maps AudioContext scheduling time onto the Web MIDI performance clock (`performance.now()` domain).
- **MIDI Clock**: 24ppq emitted from the live scheduler - 6 ticks per 16th on the **unswung** grid, within the existing 200ms lookahead window. Clock lives only in `scheduler()`, which never runs during offline export - no extra guard needed there.
- **Transport**: Start (0xFA) on `play()`, Stop (0xFC) on `stop()`.
- **LEAD notes out**: both scheduler lead paths (theme + takeover) send Note On (velocity mapped from accent steps: 80/100/120) and Note Off at the same gate used by the audio envelope (`dur*sd*0.92`).
- **Offline safety**: `suppressMidi` field; export clones set it true so WAV rendering never leaks notes/clock to hardware.

### Verification / honesty

- AST parse of all 4 edited files; structural assertions (single clock loop, two noteOn/noteOff pairs, port wiring, suppress flags) + sessions 1-14 regressions (recTap, renderWav, extCtx init, BarPlan, duck, takeover, genre).
- Clock jitter: messages are timestamped by the browser MIDI layer from the performance-clock mapping; sub-ms drift vs the audio clock is possible (typical for Web MIDI bridges; documented).
- Static verification only. Runtime smoke: connect a hardware synth, play -> lead notes + clock sync visible; stop -> transport stops; WAV export -> hardware stays silent.


## Session 16 changes (this commit) - preset manager UI + audit of the MIDI-out stream

(The parallel workstream labeled its MIDI-out delivery "Session 15"; this entry documents my verification of it plus the new persistence UI, under Session 16.)

### 1. Audited the parallel-stream MIDI Out + Clock (read-only; verified correct)

- `MIDIOut` (midi.js): first-output selection via `pickPort`, hot-plug via `onstatechange`, `send/noteOn/noteOff/clock/transportStart(0xFA)/transportStop(0xFC)`, all try-guarded.
- `audioToPerf(ctx,t)`: correct audio-time -> `performance.now()` mapping with non-negative clamp; falls back to untimed send if `performance` is unavailable.
- Scheduler emits 24ppq clock (6 ticks per 16th on the unswung grid - correct for MIDI clock), timestamped.
- LEAD notes out on both theme and takeover paths: velocity from accent (120/100/80), note-off at gate end.
- **Offline safety**: `suppressMidi` defaults false in the constructor, set true on WAV-export clones (editor.js) - no MIDI leakage during offline renders; the clock loop lives in `scheduler()`, which never runs offline.
- Vestige noted, untouched (owned by that stream): `self._nextClock` is set in `play()` but the clock loop derives ticks from `nextNoteTime` directly. Harmless.

Conclusion: README "MIDI Out - LEAD notes + MIDI Clock" satisfied; no rebuild.

### 2. Preset Manager UI (dead functions finally surfaced)

`savePreset/loadPreset/deletePreset/listPresets` had **zero callers since the PSY6 copy** (first-audit finding). Now:

- PRESETS transport button toggles a panel: name input + SAVE, list rows with LOAD / DEL.
- **Genre travels with presets**: `savePreset` stores `genre`; `loadPreset` applies it via `setGenre` (guarded). Older presets without the field load unchanged.
- Reuses the previously-verified storage path (`psy3_presets`); session-3 `loadPreset` ctx guard intact.

### Verification / honesty

- AST parse of edited JS; structural assertions (genre round-trip, UI wiring, panel markup) + read-only audit assertions on the MIDI-out stream (0xF8/0xFA/0xFC bytes, audioToPerf, suppressMidi guards).
- Two pipeline incidents this session, both recovered transparently: (1) first run aborted on an over-strict self-assert (expected trailing comma on the genre field that the insert intentionally omits) - fixed the assert, not the code; (2) this doc entry initially failed to attach because the parallel stream had already moved the status line - re-anchored.
- Static verification only. Runtime smoke: PRESETS panel opens; save a named preset; LOAD applies (knobs/BPM/genre); DEL removes; with a MIDI output connected, playing sends lead notes + clock.


## Session 17 changes (this commit) - Phase 4 complete: projects (.psy.json)

The last README phase-4 item had zero code references since the first audit. Now:

### Project format

`{format:"psy3-project", v:1, name, timestamp, seed, variation, bpm, swing, knobVals, mutes, genre, patterns, sectionPatterns (BarPlan), patternEdited (takeover flags)}`. The arrangement is **not stored** - `buildSong(seed)` rebuilds it deterministically, keeping files small and honest.

### Implementation

- `buildProjectObject(name)`: single source of truth for the snapshot (deep copies).
- `saveProject(name)`: pretty-printed JSON Blob -> `downloadBlob` (session-13 helper) -> `<safe_name>.psy.json`; filename sanitized to `[\w-]`.
- `loadProjectFromFile(file)`: FileReader + JSON parse + format validation (`format` and `patterns` required) with explicit error statuses for wrong/corrupt files.
- `applyProject(proj)`: **commitUndo() before applying** (one Ctrl+Z returns to the pre-load state), then seed/variation/bpm/swing, genre via `setGenre`, knobVals (+applyKnob each), mutes, patterns, sectionPatterns, takeover flags, song rebuild, full UI refresh (grid/timeline/LCD) and guarded `refreshPartGains`.
- UI: SAVE PROJECT / LOAD PROJECT buttons + hidden file input inside the existing preset panel; project name taken from the panel's name input (default `psy3-project`).

### Verification / honesty

- AST parse of edited JS; structural assertions (format marker, undo-before-load, validation path, filename construction, wiring, markup) + session 1-16 regressions (preset manager, genre round-trip, WAV export, live recording, banks v3, undo BarPlan state).
- Known limitation: no in-app project library (filesystem is the library, by design); versioning is `v:1` with explicit format check, so future format changes can migrate.
- Static verification only. Runtime smoke: SAVE PROJECT downloads a .psy.json; edit something; LOAD PROJECT restores it (undo returns to the edited state); a non-project JSON shows the error status.


## Session 18 changes (this commit) - Phase 5: offline PWA actually works

Two README/manifest promises were void until now:

1. **sw.js cached nothing** - install skipped caching, fetch went network-first with a cache fallback that was never populated ("Offline support (service worker)" was fiction).
2. **manifest.json referenced `icon-192.png` / `icon-512.png` that did not exist in the repo** - installability was broken.

### Changes

- **sw.js v5**: precaches the full app shell (index.html, all 11 `src/*.js`, manifest, favicon, both icons) per-asset fault-tolerant; activates by deleting older cache versions; fetch serves same-origin GETs **cache-first with background refresh** (stale-while-revalidate). Cache keys for code assets ignore `?v=N` queries, so future cache-bust bumps don't orphan the precache.
- **Icons generated**: real PNGs (512/192, dark background, neon rings/triangle motif) matching the manifest theme color; PNG magic verified before upload.
- **index.html**: script tags bumped `?v=7` -> `?v=8` (11 tags asserted before/after).

### Verification / honesty

- sw.js parses (esprima); APP_SHELL asserted to contain all 11 module files; icon PNG magic asserted; manifest references verified against uploaded filenames.
- The per-asset `cache.add().catch()` guard means one missing asset won't block SW install - deliberate resilience, logged to console.
- Static + HTTP verification only. Runtime smoke: load once, then reload with network disabled -> app boots from cache; PWA install prompt appears (icons resolve).


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
