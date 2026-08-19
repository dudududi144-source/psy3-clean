# PSY3 PRO — Hyperspace Psytrance Workstation

> One file. Zero server. Infinite groove.
> Based on PSY6-ULTIMATE architecture.

## Live Demo

**https://dudududi144-source.github.io/psy3-clean/**

## Features

### Engine
- **PooledEngine** — 20 synth + 24 drum voices, zero GC dropouts
- **8 layers** — UI, Brain, Composition, Scheduler, Engine, FX, Persistence, I/O
- **Master FX Chain** — Filter + Delay + Reverb + Drive

### Creative Brain
- **GENERATIVE** — CandidateGenerator creates 5 candidates/bar, picks best
- **MANUAL** — Only plays what you program
- **ADAPTIVE** — Learns from performance, generates from grammars

### Grammar System
- **BassGrammar** — 12x12 interval transition matrix
- **MelodicGrammar** — Interval histogram + contour tracking
- **RhythmGrammar** — 16-step kick onset probabilities

### Music
- **Chord Progressions** — 7 progressions (Epic, Minor, Major, Andalusian, Melodic, Psy Hypnotic, Pop/Prog)
- **Arpeggiator** — UP, DOWN, UP-DOWN, RANDOM, CHORD
- **Bass Modes** — ROLLING, OFFBEAT, PUMPING, HALFTIME
- **Pattern Operations** — 12 types (Nudge, Rotate, Copy/Paste, Swap, Merge, Invert, etc.)

### I/O
- **MIDI In** — Notes + CC (auto-learn)
- **MIDI Out** — LEAD notes + MIDI Clock
- **WAV Export** — Offline rendering
- **Live Recording** — MediaRecorder

### Persistence
- **Pattern Banks A-D** — localStorage
- **Session Persistence** — Full restore on reload
- **Projects** — Save/load .psy.json

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| SPACE | Play / Stop |
| V | New variation (reseed) |
| W | Generate chord progression |
| D | Generate drum pattern |
| H | Generate melody |
| Z | Generate arpeggio |
| R | Record + Export WAV (4 bars) |
| S | Sound design randomizer |
| A | Cycle arpeggiator mode |
| 1-8 | Jump to section |
| ? | Help overlay |

## Quick Start

1. Open the live demo
2. Press POWER (or click anywhere)
3. Press SPACE to play
4. Press ? for help

## Architecture

Based on PSY6-ULTIMATE v6.5 architecture.
See ARCHITECTURE.md for full specification.

## License

MIT

---

*PSY3 PRO — Professional psytrance production instrument.*
