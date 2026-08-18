# PSY3 PRO - ROADMAP

## Current Status: PLAYING (v1.0)

The device plays music. The Groovebox engine works.
Now we build the professional product around it.

---

## Phase 1: DESIGN REBUILD (Week 1)

### Goal: Professional chassis design inspired by hardware synths

- [x] 1.1 Rebuild HTML structure with proper semantic layout
- [x] 1.2 Professional CSS design system (dark theme, gradients, shadows)
- [x] 1.3 Chassis design (metal body, wood cheeks, corner screws)
- [x] 1.4 Transport panel (PLAY, STOP, VARIATE, NEXT SEC)
- [x] 1.5 Display panel (LCD with section info, BPM, variation)
- [x] 1.6 Knobs panel (FILTER, RES, DRIVE, DELAY, REVERB, SWING)
- [x] 1.7 Sequencer panel (16-step grid with part colors)
- [x] 1.8 Pads panel (8 performance pads)
- [x] 1.9 Timeline panel (song sections visualization)
- [x] 1.10 Visualizer (canvas-based waveform/spectrum)
- [x] 1.11 Responsive design (mobile + desktop)
- [x] 1.12 Status bar and self-test display

### Success Criteria:
- Looks like a professional hardware synth
- All panels visible and functional
- Responsive on mobile (320px+) and desktop (1920px)
- No emoji, clean text labels
- Dark theme with proper contrast

### Status: COMPLETE

---

## Phase 2: FUNCTIONALITY (Week 2)

### Goal: Connect all UI elements to the Groovebox engine

- [ ] 2.1 Transport buttons connected to device.play()/stop()/variate()
- [ ] 2.2 Knobs connected to device.applyKnob()
- [ ] 2.3 Sequencer steps connected to device patterns
- [ ] 2.4 Pads connected to device.triggerPad()
- [ ] 2.5 Timeline connected to device.jumpSection()
- [ ] 2.6 Display updates in real-time during playback
- [ ] 2.7 Visualizer connected to device.analyser
- [ ] 2.8 BPM control connected to device.bpm
- [ ] 2.9 Mute buttons connected to device.mutes
- [ ] 2.10 Section navigation connected to device.seekToBar()

### Success Criteria:
- Every UI element controls the engine
- Real-time visual feedback during playback
- No dead buttons or disconnected controls

### Status: NOT STARTED

---

## Phase 3: FEATURES (Week 3)

### Goal: Add professional features

- [ ] 3.1 Preset system (save/load device state)
- [ ] 3.2 Pattern editor (edit sequencer patterns)
- [ ] 3.3 Song editor (arrange sections)
- [ ] 3.4 MIDI input support (Web MIDI API)
- [ ] 3.5 MIDI learn (map CC to parameters)
- [ ] 3.6 Keyboard shortcuts
- [ ] 3.7 Undo/Redo system
- [ ] 3.8 Settings persistence (localStorage)

### Success Criteria:
- All features work without errors
- State persists across page reloads
- MIDI controllers can control the device

### Status: NOT STARTED

---

## Phase 4: MOBILE (Week 4)

### Goal: Full mobile experience

- [ ] 4.1 Touch-optimized controls (44px+ touch targets)
- [ ] 4.2 Stacked layout for portrait mode
- [ ] 4.3 Bottom navigation bar
- [ ] 4.4 Swipe gestures for section navigation
- [ ] 4.5 Reduced animations on mobile
- [ ] 4.6 PWA manifest (installable app)
- [ ] 4.7 Offline support (service worker)

### Success Criteria:
- Fully usable on 320px width
- Touch response < 50ms
- Installable as PWA
- Works offline

### Status: NOT STARTED

---

## Phase 5: QUALITY (Week 5)

### Goal: Production-ready quality

- [ ] 5.1 Error handling everywhere
- [ ] 5.2 Loading states
- [ ] 5.3 Accessibility (ARIA labels, keyboard navigation)
- [ ] 5.4 Performance optimization (60fps animations)
- [ ] 5.5 Cross-browser testing
- [ ] 5.6 Documentation (README, user guide)

### Success Criteria:
- No console errors
- 60fps on mid-range devices
- Accessible via keyboard
- Works in Chrome, Firefox, Safari, Edge

### Status: NOT STARTED

---

## Phase 6: LAUNCH (Week 6)

### Goal: Ship it

- [ ] 6.1 Final design polish
- [ ] 6.2 Performance audit
- [ ] 6.3 SEO meta tags
- [ ] 6.4 Analytics (privacy-respecting)
- [ ] 6.5 Launch announcement
- [ ] 6.6 Feedback collection system

### Success Criteria:
- Product is live and stable
- Users can provide feedback
- No critical bugs

### Status: NOT STARTED

---

## Architecture Decisions

### What we keep:
- Groovebox engine (original, working)
- Web Audio API for sound
- Single-file deployment (index.html + app.js)

### What we build:
- Professional design system
- Proper state management
- Mobile-first responsive layout
- PWA capabilities

### What we avoid:
- Frameworks (vanilla JS for performance)
- External dependencies (self-contained)
- Over-engineering (ship fast, iterate)

---

## Tracking

| Phase | Status | Started | Completed |
|-------|--------|---------|-----------|
| Phase 1: Design | COMPLETE | 2026-08-18 | 2026-08-18 |
| Phase 2: Functionality | NOT STARTED | - | - |
| Phase 3: Features | NOT STARTED | - | - |
| Phase 4: Mobile | NOT STARTED | - | - |
| Phase 5: Quality | NOT STARTED | - | - |
| Phase 6: Launch | NOT STARTED | - | - |

---

## Change Log

| Date | Change | Phase |
|------|--------|-------|
| 2026-08-18 | Device plays music after rebuild | v1.0 |
| 2026-08-18 | Roadmap created | - |
| 2026-08-18 | Phase 1 complete: professional design system | Phase 1 |

---

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

### Shadows:
- deep: 0 20px 60px rgba(0,0,0,0.8)
- panel: 0 4px 16px rgba(0,0,0,0.4)
- inset: inset 0 2px 8px rgba(0,0,0,0.6)
- raised: 0 2px 8px rgba(0,0,0,0.3)
