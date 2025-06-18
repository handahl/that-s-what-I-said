import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    sveltekit(),
    nodePolyfills({
      // Enable polyfills for specific modules
      crypto: true,
      fs: true,
      path: true,
      util: true,
      stream: true,
      buffer: true,
      process: true
    })
  ],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/tests/setup.ts']
  }
});