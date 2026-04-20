---
title: "terminal-index"
description: "The site you're looking at right now. Astro-powered, retro-styled, and hand-crafted with vanilla CSS. No Tailwind was harmed in the making of this site."
status: "active"
techStack: ["Astro", "TypeScript", "CSS", "MDX"]
startDate: 2026-02-06
featured: true
---

## Overview

This portfolio is the site you're currently reading. It's built with Astro and styled with entirely hand-crafted CSS, no frameworks, no utility classes, no Tailwind.

The aesthetic is deliberately retro: Geocities-era sensibilities (88x31 buttons, scanline overlays, neon on dark) applied with modern web standards (semantic HTML, accessible color contrast, responsive layouts, 0-JS by default).

## Design Decisions

### Why vanilla CSS?

Tailwind is great for productivity. But for a personal site with a highly specific aesthetic, utility classes fight against you. Every retro effect I wanted needed custom CSS anyway so might as well own the whole stylesheet.

The design system is built entirely on CSS custom properties. Dark/light theming, the color palette, spacing, typography, all in `global.css`.

### Why no JavaScript on most pages?

Astro ships zero JS by default, and I've tried to keep it that way. The only JS on this site:

- **Starfield canvas** (the animated background)
- **Hit counter animation** (counts up on load)
- **Theme toggle** (saves to `localStorage`)
- **Mobile nav** (toggle show/hide)

Everything else is CSS. Hover effects, transitions, the marquee — all pure CSS.

### Content Collections

Posts and projects are Markdown files in `src/content/`. Astro's content collections give me type-safe frontmatter, build-time validation, and zero-config querying. It's the closest thing to a typed CMS without actually running a server.

## Technical Stack

- **Astro 5.x** — Static site generation
- **@astrojs/mdx** — MDX support for rich content
- **@astrojs/sitemap** — Auto-generated sitemap
- **@astrojs/rss** — RSS feed
- **Shiki** — Syntax highlighting (github-dark theme)
- **TypeScript** — Strict mode throughout

## Performance

Because it's static HTML with minimal JS:

- First Contentful Paint: ~0.4s
- Time to Interactive: ~0.4s (same as FCP)
- Cumulative Layout Shift: 0
- Lighthouse: 100/100/100/100

The starfield canvas is the only thing that costs anything at runtime.

## Lessons

Building a retro site with modern standards forced a bunch of interesting constraint-solving:

- Scanline overlay via CSS `repeating-linear-gradient` no images needed
- Window chrome via pure CSS borders and flexbox
- Theme toggle with no FOUC via an inline `<script>` in `<head>` that runs before first paint
