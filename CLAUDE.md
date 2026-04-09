# Portfolio Site — CLAUDE.md

## Project Overview

Personal portfolio website built with Astro. Retro Geocities/Neocities aesthetic meets modern web standards. Dark-themed, fully responsive, accessibility-first.

## Tech Stack

- **Framework:** Astro (static output)
- **Styling:** Vanilla CSS with custom properties (`src/styles/global.css`)
- **Content:** Markdown/MDX via Astro content collections
- **Integrations:** `@astrojs/mdx`, `@astrojs/sitemap`, `@astrojs/rss`

## Key Conventions

- No Tailwind, no CSS frameworks — all styles hand-crafted
- Minimal JS — prefer CSS for animations and effects
- Content collections for blog posts and projects (schemas in `src/content/config.ts`)
- All components are `.astro` files unless JS framework island is truly needed

## Content Collections

- `src/content/blog/` — Blog posts (`.md` or `.mdx`)
- `src/content/projects/` — Project entries (`.md` or `.mdx`)

## Design System

CSS custom properties defined in `src/styles/global.css`:
- Colors: `--color-bg`, `--color-surface`, `--color-accent-cyan`, `--color-accent-magenta`, `--color-accent-lime`, `--color-accent-amber`, `--color-text`, `--color-text-muted`
- Fonts: `--font-mono`, `--font-sans`
- Retro effects applied via utility classes: `.glow-text`, `.scanlines`, `.window-chrome`, `.pixel-border`

## Pages

- `/` — Homepage with hero, marquee, hit counter
- `/blog` — Blog index with tag filtering
- `/blog/[slug]` — Individual post pages
- `/projects` — Project grid
- `/projects/[slug]` — Individual project pages
- `/about` — Bio, skills, timeline
- `/guestbook` — Static guestbook with fake entries

## Development

```bash
npm run dev      # Start dev server at localhost:4321
npm run build    # Build static output to dist/
npm run preview  # Preview built site
```

## Deployment

Pure static output. Deploy `dist/` to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages).
Update `site` in `astro.config.mjs` to your actual domain before deploying.

## Project Structure

```
src/
  components/       # .astro components (Header, Footer, RetroWindow, etc.)
  content/
    blog/           # Blog posts as .md/.mdx files
    projects/       # Project entries as .md/.mdx files
    config.ts       # Content collection schemas (zod)
  layouts/          # BaseLayout.astro, BlogPost.astro
  pages/            # File-based routing
  styles/
    global.css      # Design tokens, reset, global styles
public/             # Static assets (fonts, images, favicon)
astro.config.mjs    # Astro configuration
```

