// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

// Rutas privadas o técnicas que no deben aparecer en el sitemap.
const PRIVATE_PATH = /^\/(login|cuenta|api|auth)(\/|$)/;

// https://astro.build/config
export default defineConfig({
  site: 'https://nuriasanchezromero.com',
  adapter: cloudflare({
    imageService: { build: 'compile', runtime: 'cloudflare-binding' },
  }),
  // La sesión la gestiona Supabase en cookies; sin esto el adaptador
  // aprovisiona un KV "SESSION" que no usamos.
  session: false,
  integrations: [
    sitemap({
      filter: (page) => !PRIVATE_PATH.test(new URL(page).pathname),
    }),
  ],
  vite: {
    build: {
      // Scripts siempre como archivos externos (<script src>), nunca inline:
      // lo exige la CSP script-src 'self'.
      assetsInlineLimit: 0,
    },
  },
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
