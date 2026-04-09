---
title: "CSS Custom Properties Are Underrated"
description: "Everyone knows CSS variables exist. Fewer people use them to their full potential. Here's a deep dive into what they can actually do — theming, responsive design, and runtime computation."
pubDate: 2024-02-20
tags: ["css", "web", "frontend"]
draft: false
---

CSS Custom Properties (the spec name for "CSS variables") have been in browsers since 2017. Seven years later, most devs use them like this:

```css
:root {
  --primary-color: #3490dc;
}

.button {
  background: var(--primary-color);
}
```

That's fine. That's good, even! But it's roughly 20% of what they can do.

## They're not variables, they're properties

The key mental shift: custom properties aren't Sass variables. They're *properties*. They participate in the cascade, they inherit, and they can be overridden at any scope.

```css
/* Default */
:root { --gap: 1rem; }

/* Override for a specific component */
.dense-list { --gap: 0.25rem; }

/* Children inherit the override */
.dense-list > * {
  margin-bottom: var(--gap); /* 0.25rem inside .dense-list */
}
```

You don't need to repeat selectors or use BEM modifiers. The property just... propagates.

## Responsive design without media queries

Combine custom properties with `clamp()` for fluid typography:

```css
:root {
  --text-base: clamp(1rem, 2.5vw, 1.125rem);
  --text-lg:   clamp(1.125rem, 3vw, 1.375rem);
  --text-xl:   clamp(1.25rem, 4vw, 1.875rem);
  --text-hero: clamp(2rem, 8vw, 4rem);
}
```

The `clamp(min, preferred, max)` function handles the responsive scaling. No breakpoints needed.

## Runtime theming

This is where it gets fun. Custom properties can be changed with JavaScript:

```javascript
// Change a single property
document.documentElement.style.setProperty('--color-accent', '#ff006e');

// Or swap an entire theme
function setTheme(theme) {
  const root = document.documentElement;
  Object.entries(theme).forEach(([key, val]) => {
    root.style.setProperty(key, val);
  });
}
```

The browser repaints only what changed. No class swaps needed (though you can combine both).

## Computed values and the space toggle hack

One of my favorite tricks — the "space toggle":

```css
:root {
  --is-dark: ; /* empty = falsy */
  --is-light: initial; /* initial = truthy */
}

[data-theme="dark"] {
  --is-dark: initial;
  --is-light: ;
}

.box {
  /* Only one of these applies based on theme */
  background: var(--is-dark, #0a0a0f) var(--is-light, #f0ead8);
}
```

When `--is-dark` is empty, `var(--is-dark, fallback)` uses the fallback. When it's `initial`, the `var()` resolves to nothing (which effectively disables the declaration).

It's a hack. It's beautiful. It works everywhere CSS custom properties work.

## Conclusion

Next time you reach for a `.dark-mode` class or a Sass `@mixin`, ask yourself: can a custom property solve this? More often than you'd expect, the answer is yes — and the resulting code is more maintainable, more declarative, and works without a build step.

The cascade is your friend. Use it.
