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
  adapter: cloudflare({
    imageService: 'compile',
    platformProxy: { enabled: false },
  }),

  integrations: [react(), sitemap(), icon(), saastrocms(cmsConfig)],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: [
        'use-sync-external-store/shim/index.js',
        'use-sync-external-store/shim/with-selector.js',
      ],
      exclude: [
        'virtual:saastrocms/config',
        'virtual:saastrocms/admin-css',
        'virtual:saastrocms/visual-editor',
      ],
    },
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
