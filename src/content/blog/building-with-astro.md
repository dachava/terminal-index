---
title: "Six Months with Astro: An Honest Review"
description: "I've been using Astro for production projects for six months. Here's what surprised me, what annoyed me, and why I keep reaching for it anyway."
pubDate: 2024-03-10
updatedDate: 2024-03-18
tags: ["astro", "web", "javascript", "review"]
draft: true
---

Six months ago I started using Astro for every new static site project. Before that I was a happy Next.js user — app router, RSC, the whole deal. So why the switch?

Short answer: **shipping HTML feels good again**.

## What Astro actually is

Astro is a static site generator with a component model, content collections, and an island architecture. By default, it ships zero JavaScript. You opt in to interactivity at the component level.

This is the opposite of React, where you opt *out* of JavaScript (via server components, or `use client` boundaries, or whatever the current mental model is).

For content-heavy sites — blogs, documentation, portfolios — this tradeoff is excellent. Most of your pages are static. The few bits that need interactivity (a theme toggle, a code-copy button, a search box) get their own islands.

## Content Collections

This is the feature that sold me.

```typescript
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});
```

That schema is enforced at build time. If a blog post is missing a `title`, the build fails. This is the kind of type safety I've wanted from a CMS for years, and here it is — in the file system, with Zod, with full TypeScript inference.

Querying is clean:

```typescript
import { getCollection } from 'astro:content';

const posts = await getCollection('blog', ({ data }) => {
  return !data.draft;
});

posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
```

## The island architecture in practice

Astro islands are components from any framework (React, Vue, Svelte, Solid, vanilla JS) that run in isolation. You control when they hydrate:

```astro
<!-- Hydrate immediately -->
<Counter client:load />

<!-- Hydrate when visible -->
<HeavyChart client:visible />

<!-- Hydrate on idle -->
<CommentSection client:idle />

<!-- Never hydrate (static) -->
<StaticWidget />
```

In six months of real projects, I've found I almost never need `client:load`. Most interactive components can wait until visible, which dramatically improves initial load performance.

## Pain points

**MDX can be fiddly.** Getting the right version of remark/rehype plugins wired up took an afternoon. The docs are good but the ecosystem is chaotic.

**Image optimization is better than it was, but.** The `<Image />` component works well for local assets. Remote images require manual `inferSize` props or fixed dimensions. It's understandable but slightly annoying.

**The routing model is file-based, full stop.** If you want dynamic routes, you write `getStaticPaths()`. There's no incremental static regeneration (it's static output, after all). For most sites, this is fine. For anything with user-generated content at scale, you'll want a different tool.

## Verdict

For blogs, portfolios, documentation sites, marketing pages: **Astro is the right call**. The DX is excellent, the output is fast, and the content collections feature alone is worth the learning curve.

For anything requiring real-time data, user sessions, or complex client-side state: use something else. Astro isn't trying to be that.

```
Performance budget: ✓ (0 KB JS by default)
DX:                 ✓ (content collections are excellent)
Escape hatches:     ✓ (bring any framework for islands)
Production ready:   ✓ (this site you're reading is Astro)
```

Ship it.
