# PSY3 PRO - ROADMAP

## Current Status: PLAYING (v1.0)

The device plays music. The Groovebox engine works.
Now we build the professional product around it.

---

## Phase 1: DESIGN REBUILD — COMPLETE

- [x] 1.1 Rebuild HTML structure with proper semantic layout
- [x] 1.2 Professional CSS design system (dark theme, gradients, shadows)
- [x] 1.3 Chassis design (metal body, wood cheeks, corner screws)
- [x] 1.4 Transport panel (PLAY, STOP, VARIATE, NEXT SEC)
- [x] 1.5 Display panel (LCD with section info, BPM, variation)
- [x] 1.6 Knobs panel (FILTER, RES, DRIVE, DELAY, REVERB, SWING)
- [x] 1.7 Sequencer panel (16-step grid with part colors)
- [x] 1.8 Pads panel (8 performance pads, fixed size)
- [x] 1.9 Timeline panel (song sections visualization)
- [x] 1.10 Visualizer (canvas-based waveform/spectrum)
- [x] 1.11 Responsive design (mobile + desktop)
- [x] 1.12 Status bar and self-test display

### Status: COMPLETE

---

## Phase 2: FUNCTIONALITY — COMPLETE

- [x] 2.1 Transport buttons connected to device.play()/stop()/variate()
- [x] 2.2 Knobs connected to device.applyKnob()
- [x] 2.3 Sequencer steps connected to device patterns
- [x] 2.4 Pads connected to device.triggerPad()
- [x] 2.5 Timeline connected to device.jumpSection()
- [x] 2.6 Display updates in real-time during playback
- [x] 2.7 Visualizer connected to device.analyser (drawViz added)
- [x] 2.8 BPM control connected to device.bpm
- [x] 2.9 Mute buttons connected to device.mutes
- [x] 2.10 Section navigation connected to device.seekToBar()

### Status: COMPLETE

---

## Phase 3: FEATURES — COMPLETE

- [x] 3.1 Preset system (save/load device state)
- [x] 3.2 Pattern editor (edit sequencer patterns)
- [x] 3.3 Song editor (arrange sections)
- [x] 3.4 MIDI input support (Web MIDI API)
- [x] 3.5 MIDI learn (map CC to parameters)
- [x] 3.6 Keyboard shortcuts
- [x] 3.7 Undo/Redo system
- [x] 3.8 Settings persistence (localStorage)

### Status: COMPLETE

---

## Phase 4: MOBILE — COMPLETE

- [x] 4.1 Touch-optimized controls (44px+ touch targets)
- [x] 4.2 Stacked layout for portrait mode
- [x] 4.3 Bottom navigation bar
- [x] 4.4 Swipe gestures for section navigation
- [x] 4.5 Reduced animations on mobile
- [x] 4.6 PWA manifest (installable app)
- [x] 4.7 Offline support (service worker)

### Status: COMPLETE

---

## Phase 5: QUALITY — 4/6 COMPLETE

- [x] 5.1 Error handling everywhere
- [x] 5.2 Loading states
- [x] 5.3 Accessibility (ARIA labels, keyboard navigation)
- [x] 5.4 Performance optimization (60fps animations)
- [ ] 5.5 Cross-browser testing
- [ ] 5.6 Documentation (README, user guide)

### Status: 4/6 COMPLETE

---

## Phase 6: LAUNCH (Week 6)

- [ ] 6.1 Final design polish
- [ ] 6.2 Performance audit
- [ ] 6.3 SEO meta tags
- [ ] 6.4 Analytics (privacy-respecting)
- [ ] 6.5 Launch announcement
- [ ] 6.6 Feedback collection system

### Status: NOT STARTED

---

## Tracking

| Phase | Status | Started | Completed |
|-------|--------|---------|-----------|
| Phase 1: Design | COMPLETE | 2026-08-18 | 2026-08-18 |
| Phase 2: Functionality | COMPLETE | 2026-08-18 | 2026-08-18 |
| Phase 3: Features | COMPLETE | 2026-08-18 | 2026-08-18 |
| Phase 4: Mobile | COMPLETE | 2026-08-18 | 2026-08-18 |
| Phase 5: Quality | 4/6 | 2026-08-18 | - |
| Phase 6: Launch | NOT STARTED | - | - |

---

## Change Log

| Date | Change | Phase |
|------|--------|-------|
| 2026-08-18 | Device plays music after rebuild | v1.0 |
| 2026-08-18 | Roadmap created | - |
| 2026-08-18 | Phase 1 complete: professional design system | Phase 1 |
| 2026-08-18 | drawViz added, pads fixed | Phase 2 |
| 2026-08-18 | Phase 2 complete: all functionality connected | Phase 2 |
| 2026-08-18 | Phase 3: MIDI input, Preset, Undo/Redo, Settings | Phase 3 |
| 2026-08-18 | Phase 3.2 + 3.3: Pattern Editor + Song Editor | Phase 3 |
| 2026-08-18 | Phase 4.6 + 4.7: PWA manifest + Service Worker | Phase 4 |
| 2026-08-18 | Phase 4.1-4.5: Touch, Layout, Nav, Gestures, Animations | Phase 4 |
| 2026-08-18 | Phase 5.1-5.4: Error handling, Loading, ARIA, Performance | Phase 5 |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| SPACE | Play / Stop |
| A, W, S, E, D, F, T, G | Trigger pads 1-8 |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Ctrl+S | Quick save preset |

---

## Mobile Features

| Feature | Description |
|---------|-------------|
| Touch targets | 44px+ for all interactive elements |
| Stacked layout | Portrait mode optimization |
| Bottom nav | PLAY, KNOBS, SEQ, PADS buttons |
| Swipe gestures | Left/right to navigate sections |
| Reduced animations | Faster transitions on mobile |
| PWA | Installable app with offline support |

---

## Quality Features

| Feature | Description |
|---------|-------------|
| Error handling | Global error handler with status display |
| Loading state | Animated loading overlay |
| ARIA labels | role, aria-label, aria-live attributes |
| Performance | will-change hints, prefers-reduced-motion |

---

## Pattern Editor Functions

| Function | Description |
|----------|-------------|
| patternClear(part) | Clear pattern for a part (or all) |
| patternRandom(part) | Randomize pattern |
| patternReverse(part) | Reverse pattern |
| patternShift(part, dir) | Shift pattern left/right |
| patternDouble(part) | Double first 8 steps to second 8 |
| patternHalf(part) | Clear second 8 steps |
| patternInvert(part) | Invert pattern (0 to 1, 1 to 0) |

---

## Song Editor Functions

| Function | Description |
|----------|-------------|
| songAddSection(name) | Add a new section |
| songRemoveSection(index) | Remove a section |
| songMoveSection(from, to) | Move a section |
| songDuplicateSection(index) | Duplicate a section |
| songGetInfo() | Get song info |

---

## PWA Support

- manifest.json for installable app
- Service worker for offline support
- Cache-first strategy
- Auto-update on new version

---


---

## Phase A: AUDIO QUALITY (Commercial Grade)

### Goal: Surpass OscillatorNode toys — commercial-grade sound

- [x] A1. PooledEngine — Zero GC Architecture (20 synth + 24 drum voices)
- [ ] A2. PolyBLEP oscillators — band-limited
- [ ] A3. ZDF State-Variable Filter — zero-delay feedback
- [ ] A4. Brickwall limiter — threshold -1dB, 20:1
- [ ] A5. Oversampled lowpass — anti-aliasing
- [ ] A6. Per-voice envelopes — analog-style ADSR
- [ ] A7. tanh soft-clip — output stage

### Status: 1/7 COMPLETE

---

## Phase B: CREATIVE BRAIN

### Goal: Autonomous creation — not just play, but create

- [ ] B1. Grammar System — Bass/Melodic/Rhythm
- [ ] B2. CandidateGenerator — 5 candidates/bar
- [ ] B3. ADAPTIVE mode — learns from performance
- [ ] B4. Chord Progressions — generative
- [ ] B5. Arpeggiator — UP/DOWN/RANDOM
- [ ] B6. Pattern Banks A-D — localStorage

### Status: NOT STARTED

---

## Phase C: PRO I/O

### Goal: Professional export and integration

- [ ] C1. WAV Export — offline rendering
- [ ] C2. MIDI Export — Standard MIDI File
- [ ] C3. MIDI Out — notes + MIDI Clock
- [ ] C4. Stem Export — per-track WAV
- [ ] C5. Project Save/Load — .psy.json
- [ ] C6. Live Recording — MediaRecorder

### Status: NOT STARTED

---

## Phase D: PRODUCT QUALITY

### Goal: Commercial product end-to-end

- [ ] D1. Per-Track Control — Mute/Solo/Volume/Pan
- [ ] D2. Session Persistence — full restore
- [ ] D3. Testing — 100+ tests
- [ ] D4. Help Overlay — ? key
- [ ] D5. 3D Spectrum — visualizer
- [ ] D6. Documentation — architecture + user guide

### Status: NOT STARTED

---

## Commercial Roadmap Tracking

| Phase | Status | Progress |
|-------|--------|----------|
| Phase A: Audio Quality | 1/7 | PooledEngine done |
| Phase B: Creative Brain | 0/6 | NOT STARTED |
| Phase C: Pro I/O | 0/6 | NOT STARTED |
| Phase D: Product Quality | 0/6 | NOT STARTED |

---

## Score Tracking

| Category | Current | Target |
|----------|---------|--------|
| Architecture | 70 | 95 |
| Audio quality | 50 | 90 |
| Voice management | 60 | 95 |
| FX breadth | 60 | 85 |
| Creative brain | 40 | 90 |
| I/O | 50 | 95 |
| Testing | 30 | 90 |
| UX | 75 | 90 |
| Documentation | 70 | 90 |
| Performance | 65 | 95 |

**Current score: ~57/100**
**Target score: ~92/100**

## Design System Reference

### Colors:
- Background: #06080c (deep), #0a0c12 (primary), #0f1118 (panel)
- Accents: orange #ffb454, cyan #3fa9bc, green #b8e05a, red #ff4757, purple #a78bfa
- Parts: kick #ff2e88, bass #ff8a3c, perc #ffd166, lead #06d6a0, arp #118ab2, pad #a8e6cf
- LCD: #b8e05a (green phosphor)

### Typography:
- UI: system-ui, -apple-system, 'Segoe UI', sans-serif
- Mono: 'SF Mono', 'Cascadia Code', 'Consolas', monospace

### Spacing:
- xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 32px

### Border Radius:
- sm: 4px, md: 8px, lg: 14px, xl: 20px
