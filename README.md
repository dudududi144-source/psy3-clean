# PSY3 PRO - Hyperspace Psytrance Workstation

Professional psytrance production instrument. One file. Zero server. Infinite groove.

## Live Demo

https://dudududi144-source.github.io/psy3-clean/

## Features

### Sound Engine
- Groovebox engine - Professional psytrance synthesis
- 6 parts - KICK, BASS, PERC, LEAD, ARP, PAD
- 16-step sequencer - With part colors and mute buttons
- Song arranger - Multiple sections with transitions
- Real-time visualizer - 64-bar frequency spectrum

### Controls
- 7 knobs - BPM, FILTER, RESO, DRIVE, DELAY, REVERB, SWING
- 8 performance pads - Trigger melodic patterns
- Transport - PLAY, VARIATE, NEXT SEC
- Timeline - Visual song section navigation

### Features
- Preset system - Save/load device state
- Pattern editor - Clear, random, reverse, shift, double, half, invert
- Song editor - Add, remove, move, duplicate sections
- MIDI input - Web MIDI API with CC/note mapping
- MIDI learn - Map controllers to parameters
- Undo/Redo - 50-step history
- Settings persistence - localStorage

### Mobile
- Touch-optimized - 44px+ touch targets
- Stacked layout - Portrait mode optimization
- Bottom navigation - PLAY, KNOBS, SEQ, PADS
- Swipe gestures - Left/right to navigate sections
- PWA - Installable app with offline support

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| SPACE | Play / Stop |
| A, W, S, E, D, F, T, G | Trigger pads 1-8 |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Ctrl+S | Quick save preset |

## MIDI Support

- Web MIDI API integration
- CC mapping via MIDI Learn
- Note mapping for pad triggers
- Auto-detect MIDI controllers
- Hot-plug support

## Pattern Editor Functions

| Function | Description |
|----------|-------------|
| patternClear(part) | Clear pattern for a part (or all) |
| patternRandom(part) | Randomize pattern |
| patternReverse(part) | Reverse pattern |
| patternShift(part, dir) | Shift pattern left/right |
| patternDouble(part) | Double first 8 steps to second 8 |
| patternHalf(part) | Clear second 8 steps |
| patternInvert(part) | Invert pattern |

## Song Editor Functions

| Function | Description |
|----------|-------------|
| songAddSection(name) | Add a new section |
| songRemoveSection(index) | Remove a section |
| songMoveSection(from, to) | Move a section |
| songDuplicateSection(index) | Duplicate a section |
| songGetInfo() | Get song info |

## Architecture

psy3-clean/
  index.html       - HTML + CSS (design system)
  app.js           - Groovebox engine + UI logic
  manifest.json    - PWA manifest
  sw.js            - Service worker (offline)
  ROADMAP.md       - Development roadmap
  README.md        - This file

## Design System

### Colors
- Background: #06080c (deep), #0a0c12 (primary), #0f1118 (panel)
- Accents: orange #ffb454, cyan #3fa9bc, green #b8e05a, red #ff4757, purple #a78bfa
- Parts: kick #ff2e88, bass #ff8a3c, perc #ffd166, lead #06d6a0, arp #118ab2, pad #a8e6cf
- LCD: #b8e05a (green phosphor)

### Typography
- UI: system-ui, -apple-system, Segoe UI, sans-serif
- Mono: SF Mono, Cascadia Code, Consolas, monospace

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Development

### Local Development

Serve locally:
  npx serve .

Or use Python:
  python -m http.server 8000

### Deployment
Deployed to GitHub Pages. Push to main branch to update.

## License

MIT

---

PSY3 PRO - Professional psytrance production instrument.
