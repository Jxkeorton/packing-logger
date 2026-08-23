// @ts-check
import { defineConfig } from 'astro/config';

import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  server: {
    // Listen on the LAN so it can be opened from a phone on the same wifi
    // during local dev (`npm run dev`).
    host: true,
    port: 4321,
  },
});