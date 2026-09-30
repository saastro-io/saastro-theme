import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Dos cosas para los tests que renderizan primitivos (.tsx): el alias `@/`
// del tsconfig (importan `@/lib/utils`) y JSX transformado — el tsconfig de
// Astro fija `jsx: preserve` y vite no parsea el .tsx con él.
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
