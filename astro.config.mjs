// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://dachava.dev',
  output: 'static',

  integrations: [
    mdx(),
    sitemap(),
  ],

  markdown: {
    shikiConfig: {
      themes: {
        dark:  'dracula',
        light: 'catppuccin-latte',
      },
      wrap: true,
    },
  },

  adapter: cloudflare(),
});