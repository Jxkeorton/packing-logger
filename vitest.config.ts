import { defineConfig } from 'vitest/config';

// Plain Node-side tests only (src/lib/**/*.test.ts) — no Astro components or
// browser DOM involved, so this stays a minimal Vite config rather than
// pulling in Astro's own (getViteConfig from 'astro/config'), which exists
// for testing .astro components specifically.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
