// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://yourname.dev',
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
});
