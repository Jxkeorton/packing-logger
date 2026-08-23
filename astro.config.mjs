// @ts-check
import { defineConfig } from 'astro/config';

import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  server: {
    // Listen on the LAN so it can be opened from a phone on the same wifi.
    host: true,
    port: 4321,
  },
});
