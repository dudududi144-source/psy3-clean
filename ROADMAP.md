# PSY3 PRO — ROADMAP (Session 20 truth edition)

> Rewritten after the 19-session audit + remediation (see ENGINEERING.md —
> the source of truth, where every claim carries its verification).
> Self-assigned scores were retired; this file now states what the code
> actually contains.

## Overall Status

All six phases of the remediation plan are COMPLETE (structural stabilization,
modularization, musical correctness, I/O, PWA, creative brain). Remaining work
is listed under "Known Gaps" — deliberately, without claiming otherwise.

## Product Phases (original)

| Phase | Real status |
|---|---|
| 1. Design rebuild | Done (UI chassis, LCD, knobs, seq, pads, timeline, viz) |
| 2. Functionality | Done (transport/knobs/seq/pads/timeline wired) |
| 3. Features | Done with caveats: preset UI (S16), audible pattern editing (S7), MIDI in + learn (S2), shortcuts (pad-key conflict documented), undo/redo incl. BarPlan/project states (S3/S17), session restore (S3). **Song editor functions exist but have no UI.** |
| 4. Mobile | Touch layout + gestures done; PWA/offline became real only at S18 (precache + icons). **Cross-browser testing: never performed.** |
| 5. Quality | Error handler (S1), loading states, help overlay done. **Performance: never measured. Automated tests: zero.** Docs now real (this file + ENGINEERING.md). |
| 6. Launch | Not started (SEO/analytics/feedback remain) |

## Commercial Phases — honest ledger

### Phase A: Audio Quality
| Item | Real status |
|---|---|
| A1 PooledEngine | **Removed (S11)** — verified never-triggered (44 silent always-on voices). Per-note engine is the truth. |
| A2 PolyBLEP | Object exists in dsp.js, **unwired** |
| A3 ZDF SVF | Object exists, **unwired** (returns a plain biquad) |
| A4 Brickwall limiter | **Wired (S10)** — -1dB/20:1 in the master chain |
| A5 Oversampled lowpass | Object exists, **unwired** |
| A6 Envelopes | Functional per-voice filter+amp envelopes; the ADSR object is unwired |
| A7 tanh soft-clip | **Live** as the drive stage (WaveShaper) |

### Phase B: Creative Brain
| Item | Real status |
|---|---|
| B1 Grammars | **Learning for real (S19)** — updateGrammars defined; melodic learning added |
| B2 CandidateGenerator | **Candidate-dependent fitness (S19)** |
| B3 ADAPTIVE | Works (S7 lowercase-key fix) + UI (S19) |
| B4 Chord progressions | 7 progressions exist; W selects one into the status line — **they do not drive audible parts** |
| B5 Arpeggiator | Object **unwired**; arp audio = editable patterns |
| B6 Pattern Banks | **v3 (S7/S15)** incl. per-section overrides |

### Phase C: Pro I/O
| Item | Real status |
|---|---|
| C1 WAV export | **Done (S13)** — offline render from playhead |
| C2 SMF export | **Not implemented** |
| C3 MIDI Out | **Done** (parallel stream, audited S16) — notes + 24ppq clock + transport |
| C4 Stem export | **Not implemented** |
| C5 Projects .psy.json | **Done (S17)** |
| C6 Live recording | **Done (S14)** — post-master webm |

### Phase D: Product Quality
| Item | Real status |
|---|---|
| D1 Per-track control | Mutes work; TrackControl (vol/pan/sends) exists but is **never initialized** |
| D2 Session persistence | **Done (S3)** |
| D3 Testing | **Zero automated tests.** Static (AST) verification only so far. |
| D4 Help overlay | Done (? key) |
| D5 Visualizer | 2D analyser viz; no 3D spectrum |
| D6 Documentation | **Done (S20)** — ENGINEERING.md + honest README/ROADMAP |

## Known Gaps (the honest backlog)

1. Listening test — nothing replaces ears; all verification so far is static.
2. Automated test suite (unit: theory/rng/grammars; snapshots: seeded renders).
3. ChordEngine audible wiring; Arpeggiator wiring or removal.
4. SMF export, stem export.
5. TrackControl: wire it properly or delete it (double-routing landmine documented S3).
6. Dead DSP objects (PolyBLEP/ZDF/Oversampled/ADSR): wire or delete.
7. Pad-key vs shortcut conflict (A/W/D); keymap separation.
8. Pattern operations: UI exposure + per-section scope.
9. Song editor UI. Cross-browser testing. Performance measurement.

## Reference: Pattern Operations (in code)

patternClear / patternRandom / patternReverse / patternShift / patternDouble /
patternHalf / patternInvert — operate on the global pattern set (sections
without BarPlan overrides hear them; D/H/Z keys expose three of them).

## Reference: Song Editor Functions (in code, no UI)

songAddSection / songRemoveSection / songMoveSection / songDuplicateSection /
songGetInfo.

## PWA

sw.js v5: app-shell precache, cache-first with background refresh
(stale-while-revalidate), query-normalized cache keys, real icons.
Offline genuinely works as of S18.

## Design System

Colors: bg #06080c/#0a0c12/#0f1118; accents #ffb454 #3fa9bc #b8e05a #ff4757 #a78bfa;
parts: kick #ff2e88, bass #ff8a3c, perc #ffd166, lead #06d6a0, arp #118ab2, pad #a8e6cf;
LCD #b8e05a. Mono: 'SF Mono'/'Cascadia Code'/Consolas. Radius 4/8/14/20. Spacing 4/8/16/24/32.

## Keyboard

See README (single source for input mappings).
