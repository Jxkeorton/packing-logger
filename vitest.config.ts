import { defineConfig } from 'vitest/config';

// Plain Node-side tests only (src/lib/**/*.test.ts) — no Svelte components
// or browser DOM involved, so this stays a minimal Vite config of its own
// rather than reusing vite.config.ts's SvelteKit/Tailwind plugins, which
// exist for building the app, not for testing these plain TS modules.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
