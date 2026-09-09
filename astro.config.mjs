// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://nuriasanchezromero.com',
  adapter: cloudflare({
    imageService: { build: 'compile', runtime: 'cloudflare-binding' },
  }),
  fonts: [
    {
      name: 'Bricolage Grotesque',
      cssVariable: '--font-display',
      provider: fontProviders.google(),
      weights: [800],
      styles: ['normal'],
      fallbacks: ['Helvetica Neue', 'Arial', 'sans-serif'],
    },
    {
      name: 'DM Sans',
      cssVariable: '--font-body',
      provider: fontProviders.google(),
      weights: [400, 500, 700],
      styles: ['normal'],
      fallbacks: ['Helvetica Neue', 'Arial', 'sans-serif'],
    },
    {
      name: 'Rubik',
      cssVariable: '--font-sticker',
      provider: fontProviders.google(),
      weights: [900],
      styles: ['normal'],
      fallbacks: ['Arial Black', 'Arial', 'sans-serif'],
    },
  ],
});
