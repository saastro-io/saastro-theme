// @ts-check
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import icon from 'astro-icon';
import { defineConfig } from 'astro/config';
import saastroStudio from '@saastro/studio';
import { fileURLToPath } from 'node:url';

// Strips the saastro:studio-* meta tags from prod HTML responses. Registered
// 'pre' and BEFORE saastroStudio so it wraps Studio's own injector middleware
// (response path runs outermost-last). See the middleware file for details.
/** @type {import('astro').AstroIntegration} */
const stripStudioMeta = {
  name: 'strip-studio-meta',
  hooks: {
    'astro:config:setup': ({ addMiddleware }) => {
      addMiddleware({
        entrypoint: fileURLToPath(
          new URL('./src/integrations/strip-studio-meta-middleware.ts', import.meta.url),
        ),
        order: 'pre',
      });
    },
  },
};

export default defineConfig({
  site: 'https://saastro-theme.pages.dev/',
  output: 'server',
  adapter: cloudflare({
    imageService: 'passthrough',
  }),

  // Declarative i18n config. `routing: 'manual'` means Astro does NOT inject its
  // own locale routing — our middleware + the `[locale]/` routes own that (EN at
  // the root, ES prefixed). This block exists so tooling (Saastro Studio/Hub)
  // can detect locales + defaultLocale, and `astro:i18n` utils are available.
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
    routing: 'manual',
  },

  // Disable Astro sessions — there's no auth flow in the site anymore.
  // Without this, @astrojs/cloudflare injects a SESSION KV binding that
  // doesn't exist in CF Pages and causes a 500 on every request.
  session: {
    driver: {
      entrypoint: 'unstorage/drivers/null',
    },
  },

  integrations: [
    stripStudioMeta,
    react(),
    sitemap(),
    icon(),
    saastroStudio({ autoWrap: true, autoWrapPages: true }),
  ],
  vite: {
    plugins: [tailwindcss()],
    server: {
      // When Saastro Studio proxies this dev server under hub.saastro.test:4901,
      // the iframe needs CORS to read the page. Dev-only; harmless standalone.
      cors: {
        origin: ['http://hub.saastro.test:4901', 'http://localhost:4901', 'http://127.0.0.1:4901'],
        credentials: true,
      },
      headers: {
        'Access-Control-Allow-Origin': 'http://hub.saastro.test:4901',
        'Access-Control-Allow-Credentials': 'true',
      },
      allowedHosts: true,
      // Pin Vite's HMR client straight at this dev server so it connects on the
      // first try when proxied (otherwise it targets the Hub origin, fails, and
      // logs noise before falling back). Harmless standalone — this IS the dev
      // server's own host/port. Dev-only.
      hmr: {
        host: 'localhost',
        protocol: 'ws',
        clientPort: 4930,
      },
    },
    optimizeDeps: {
      include: [
        'use-sync-external-store/shim/index.js',
        'use-sync-external-store/shim/with-selector.js',
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
