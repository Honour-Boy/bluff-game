import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// ─── Vitest config — JSDOM env, RTL setup ───────────────────────────
// Mirrors the server's vitest setup but adds the React / DOM bits the
// client needs.
//
// JSX in .js files: Next.js compiles JSX in plain .js files, and the
// existing client codebase relies on that. Vitest 4 uses Rolldown/oxc
// by default, which doesn't parse JSX from .js files — so we wire up
// the official @vitejs/plugin-react and tell its Babel layer to treat
// every .js / .jsx file in src/ as JSX. This matches how Next.js
// compiles the same files at runtime.
export default defineConfig({
  // Tell oxc to treat .js files as JSX. Without this Vite's oxc
  // transformer sees raw JSX tokens in .js files and bails with
  // "JSX syntax is disabled". We override the default include filter
  // (which excludes .js) and force `lang: 'jsx'` so the parser opens
  // the JSX gate for every .js file too. Next.js's webpack-side build
  // does the same thing for app routes.
  oxc: {
    include: /\.(jsx?|tsx?)$/,
    exclude: [],
    lang: 'jsx',
  },
  plugins: [
    react({
      // Babel parses JSX from .js too — Vite's default would skip them.
      include: /\.(js|jsx)$/,
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
