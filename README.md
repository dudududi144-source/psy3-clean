# PSY3 PRO — Hyperspace Psytrance Workstation

> Eleven modules. Zero server. One very opinionated groovebox.
> Rebuilt from the PSY6-ULTIMATE copy into a verified, modular codebase
> (audit + remediation log: `ENGINEERING.md`).

## Live Demo

**https://dudududi144-source.github.io/psy3-clean/** (requires GitHub Pages enabled)

## Features (each line verified against the code)

### Engine
- **Per-note voice engine** — purpose-built kick/bass/lead/arp/pad/percussion
  voices with per-note filter + amp envelopes (the never-triggered PooledEngine
  was verified dead and removed; see ENGINEERING.md session 11)
- **Modular codebase** — 11 classic-script modules + boot file, no build step
- **Master chain** — auto-filter → DJ filter (**LP/HP switchable**) → tanh drive →
  glue compressor → **brickwall limiter (-1dB, 20:1)** → analyser
- **Sidechain** — kick-ducked BASS/PAD bus, depth via the **DUCK knob**
- **Genres** — FULL-ON / DARK-PSY / PROGRESSIVE presets, live per-note (GENRE button)
- **Offline PWA** — real service-worker precache (cache-first + background refresh),
  icons included, installable

### Sequencer & Song
- **176-bar arrangement** — INTRO/BUILD/DROP/BREAK/RISER/DROP2/OUTRO with
  scale modes, energy curves, pre-drop silence gate, fills
- **BarPlan** — every section can own its pattern grid; first edit on a section
  clones the baseline (KICK/PERC/ARP/PAD rows audible; BASS/LEAD take over on edit)
- **4-row step editor** — KICK / PERC / ARP / PAD, grid follows the playing section
- **Pattern Banks A-D** (shift+click saves), 7 pattern operations in code
  (clear/random/reverse/shift/double/half/invert; D/H/Z keys expose three)

### Creative Brain (all three modes reachable via the BRAIN button)
- **MANUAL** — plays only what you programmed
- **GENERATIVE** — deterministic per-bar arp-phrase evolution
- **ADAPTIVE** — grammar-driven kick generation; grammars (bass 12x12,
  melodic intervals, rhythm) **actually learn while you play**
- **CandidateGenerator** — 5 candidates/bar, candidate-dependent fitness
  (grammar likelihoods, ~50% density target, four-on-the-floor anchors)

### I/O
- **MIDI In** — notes (C2-G2 to pads) + CC with right-click **MIDI Learn** on knobs
- **MIDI Out** — LEAD notes (accent velocity, gated note-offs) + **24ppq MIDI Clock**
  + Start/Stop transport; silent during offline renders
- **WAV Export** — offline rendering of N bars from the playhead (R key / EXPORT)
- **Live Recording** — post-master tap via MediaRecorder (REC button, webm)

### Persistence
- **Presets** — PRESETS panel (save/load/delete, genre travels with the preset)
- **Session restore** — settings + genre restored on reload
- **Projects** — full track state save/load via `.psy.json` files
- **Undo/Redo** — Ctrl+Z / Ctrl+Shift+Z over pattern edits, banks, project loads

## Keyboard & Mouse

| Input | Action |
|-----|--------|
| SPACE | Play / Stop |
| A W S E D F T G | Trigger pads 1-8 (see conflict note below) |
| V | New variation (reseed) |
| W / D / H / Z | Randomize progression (status) / kick / lead / arp |
| A | Cycle arpeggiator mode |
| 1-8 | Jump to section |
| R | Export 4 bars to WAV from the playhead |
| ? | Help overlay |
| Escape | Cancel MIDI learn |
| Ctrl+Z / Ctrl+Shift+Z | Undo / Redo |
| Ctrl+S | Quick-save preset |
| Right-click knob | MIDI Learn that knob |
| Double-click knob | Reset knob to default |
| LP/HP label | DJ filter mode |

**Known conflict (documented, not hidden):** pad keys A/W/D overlap the W/D/A
shortcuts — pressing them does both. A keymap separation is a tracked fix.

## Honest Limitations

- **ChordEngine** holds 7 progressions but only surfaces them in the status line;
  the arrangement is scale/theme-driven — chords do not yet drive audible parts.
- **Arpeggiator object** (UP/DOWN/...) is unwired; arp audio comes from editable patterns.
- **Bass styles** are gallop / offbeat / pumping / pedal (per section); once you edit
  BASS anywhere, bass becomes pattern-driven everywhere.
- **No automated test suite yet** — quality so far is static verification
  (AST-level) + code review; a listening test is the next gate.
- Song-editor functions exist in code without UI.

## Quick Start

1. Open the live demo (or serve the folder with any static server)
2. Click anywhere once (browser audio-unlock), press **SPACE**
3. Press **?** for help, try **GENRE / BRAIN / EXPORT / REC**

## Architecture

Eleven modules (`src/core, pools, midi, theory, song, groovebox, dsp,
brain-runtime, ui, editor, main`) — all executable code lives in the boot
section of `main.js`; everything above it is declarations. Full history,
verified claims and known gaps: **ENGINEERING.md**.

## License

MIT
