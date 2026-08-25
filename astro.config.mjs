// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  integrations: [
    // Only the Logbook tab's add/edit/list form uses React (as a
    // `client:load` island) — everywhere else stays plain Astro +
    // vanilla TS, see lib/client/. That form's edit-mode state (which
    // jump, which fields, matching a saved profile back to its dropdown
    // option) was significant imperative DOM bookkeeping; React's
    // component state does that declaratively for a lot less code.
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: vercel({
    // The invoice PDF embeds its own font files (see src/lib/invoice-pdf.ts)
    // rather than relying on pdfkit's built-in standard fonts, whose
    // internal module resolution doesn't survive Vercel's function
    // bundling. Read via plain fs calls, these normally get traced and
    // included automatically, but they're forced in explicitly too so a
    // missing font can never turn into a silent 500 in production again.
    includeFiles: ['./src/assets/fonts/Roboto-Regular.ttf', './src/assets/fonts/Roboto-Medium.ttf'],
  }),
  server: {
    // Listen on the LAN so it can be opened from a phone on the same wifi
    // during local dev (`npm run dev`).
    host: true,
    port: 4321,
  },
});