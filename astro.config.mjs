// @ts-check
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import icon from 'astro-icon';
import { defineConfig } from 'astro/config';
import saastrocms from '@saastro/cms';
import cmsConfig from './saastrocms.config.ts';

export default defineConfig({
  site: 'https://example.com',
  output: 'server',
  adapter: cloudflare(),

  build: {
    client: './',
    server: './_worker.js',
  },

  integrations: [react(), sitemap(), icon(), saastrocms(cmsConfig)],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': '/src',
        // Shim `debug` for workerd — the CJS `module.exports` breaks miniflare
        'debug': '/src/lib/debug-shim.ts',
      },
      dedupe: ['react', 'react-dom'],
    },
  },
});
