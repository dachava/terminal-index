---
title: "RetroTerm"
description: "A web-based terminal emulator with authentic CRT aesthetics — scanlines, phosphor glow, and era-accurate color palettes. Built to look like it's running on a PDP-11, but actually running in your browser."
status: "active"
techStack: ["TypeScript", "Canvas API", "WebAssembly", "Rust"]
repoUrl: "https://github.com/yourname/retroterm"
liveUrl: "https://retroterm.yourname.dev"
startDate: 2023-09-01
featured: true
---

## Overview

RetroTerm is a browser-based terminal emulator that renders to a `<canvas>` element with pixel-accurate CRT simulation. It supports a full VT100/ANSI escape code subset, multiple historical phosphor color modes (P1 green, P3 amber, P4 white), and a simulated raster scan effect.

The terminal emulator core is written in Rust and compiled to WebAssembly for performance. The rendering layer is TypeScript + Canvas 2D API.

## Technical Details

### Architecture

```
┌─────────────────────────────────────────┐
│           Browser (TypeScript)          │
│  ┌──────────────┐  ┌─────────────────┐  │
│  │  Input Layer │  │  Canvas Render  │  │
│  │  (keyboard,  │  │  (phosphor sim, │  │
│  │   resize)    │  │   scanlines)    │  │
│  └──────┬───────┘  └────────┬────────┘  │
│         │                   │           │
│  ┌──────▼───────────────────▼────────┐  │
│  │         WebAssembly Bridge        │  │
│  └──────────────┬────────────────────┘  │
└─────────────────┼───────────────────────┘
                  │ (shared memory)
┌─────────────────▼───────────────────────┐
│         Rust Core (WASM)                │
│  ┌──────────────┐  ┌─────────────────┐  │
│  │  VT100/ANSI  │  │   PTY Emulator  │  │
│  │   Parser     │  │   (future)      │  │
│  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────┘
```

### CRT Simulation

The phosphor glow effect uses a multi-pass render:

1. **First pass** — draw characters to an offscreen canvas
2. **Bloom pass** — apply a blur and multiply blend to simulate glow bleed
3. **Scanline pass** — overlay alternating transparent/dark horizontal bands
4. **Vignette pass** — darken corners to simulate CRT barrel distortion
5. **Composite** — merge all layers onto the visible canvas

Performance is kept acceptable by only re-rendering cells that changed between frames.

## What I Learned

- WebAssembly shared memory is fiddly but worth it for terminal parsing performance
- Canvas 2D with `globalCompositeOperation` gets you 90% of GPU blend modes without WebGL complexity
- CRT simulation is an excuse to read a lot about how cathode ray tubes actually work

## Roadmap

- [ ] PTY connection via WebSockets (shell-in-browser)
- [ ] Historical ROM font sets (IBM CGA, DEC VT220)
- [ ] Record/playback of terminal sessions
- [ ] Configurable color profiles
