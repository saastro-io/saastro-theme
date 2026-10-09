// @ts-check
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import { cacheCloudflare } from '@astrojs/cloudflare/cache';
import icon from 'astro-icon';
import { defineConfig, envField } from 'astro/config';
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

// Rutas que solo existen en el build de `studio:check` (SAASTRO_CHECK_ROUTES=1):
// casos que el Worker tiene que servir bien y que la plantilla no ejercita por
// sí sola. En el build de producción no se inyectan, así que no son superficie
// pública en ningún descendiente. Hoy, una: un `Response.redirect()` (cabeceras
// inmutables) para `scripts/cabeceras-worker-check.mjs`.
/** @type {import('astro').AstroIntegration} */
const checkRoutes = {
  name: 'saastro-check-routes',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      if (process.env.SAASTRO_CHECK_ROUTES !== '1') return;
      injectRoute({
        pattern: '/__cabeceras-check-redirect',
        entrypoint: fileURLToPath(new URL('./src/check-routes/redirect.ts', import.meta.url)),
        prerender: false,
      });
    },
  },
};

// Canonical site URL — drives <link rel="canonical">, OG/Twitter URLs, the
// sitemap and hreflang. Each project MUST set its real domain via the SITE_URL
// build env var (e.g. in the Cloudflare Workers Builds project), otherwise
// every page canonicalises to the template domain and Google indexes the wrong
// host. The fallback below is only the template's own preview URL.
const SITE_URL = process.env.SITE_URL || 'https://saastro-theme.pages.dev';
if (!process.env.SITE_URL) {
  console.warn(
    '[saastro-theme] SITE_URL is not set — canonical/OG/sitemap will use the template domain. Set SITE_URL to your real domain before deploying.',
  );
}

// Dev-server port for local preview. The Hub's `pnpm local` bridge assigns each
// site its own port and injects it as the DEV_PORT env var, so several sites can
// run their `astro dev` at once WITHOUT fighting over one hardcoded port. A plain
// `astro dev` (no DEV_PORT) falls back to Astro's default (4321). Never hardcode a
// port in the `dev` script again — a leaked `--port 4930` is what made every theme
// descendant collide.
const DEV_PORT = process.env.DEV_PORT ? Number(process.env.DEV_PORT) : undefined;

// «Páginas como datos» (prototipo). Dos cosas:
// - Las rutas `/__render`, `/__purge` y `/__blocks.json` se INYECTAN: Astro
//   ignora en `src/pages/` todo fichero que empiece por `_`, y el contrato con
//   el Hub fija esos nombres. Viven en `src/pages-datos/`.
// - Un middleware mide el render de `/p/*` y `/__render` y lo añade a
//   `Server-Timing`. No puede hacerlo la página: con streaming las cabeceras
//   salen antes de que termine de pintar.
/** @type {import('astro').AstroIntegration} */
const pagesDatos = {
  name: 'saastro-pages-datos',
  hooks: {
    'astro:config:setup': ({ addMiddleware, injectRoute }) => {
      const at = (/** @type {string} */ f) => fileURLToPath(new URL(`./src/pages-datos/${f}`, import.meta.url));
      injectRoute({ pattern: '/__render', entrypoint: at('render.astro'), prerender: false });
      injectRoute({ pattern: '/__purge', entrypoint: at('purge.ts'), prerender: false });
      injectRoute({ pattern: '/__blocks.json', entrypoint: at('blocks.json.ts'), prerender: true });
      addMiddleware({
        entrypoint: fileURLToPath(new URL('./src/lib/pages/timing-middleware.ts', import.meta.url)),
        order: 'pre',
      });
    },
  },
};

// Lo que el plugin de Studio NO instrumenta: los bloques de «páginas como
// datos» llevan sus marcadores a mano (clave = id del bloque en el documento,
// no un namespace de i18n) y sus rutas son de datos. Ver src/blocks/markers.ts.
/** @param {string} id */
const studioInclude = (id) =>
  /\.(astro|tsx|jsx)$/.test(id) &&
  !/\/src\/(blocks|components\/pages|pages-datos)\//.test(id) &&
  !/\/src\/pages\/\[\.\.\.locale\]\/p\//.test(id);

export default defineConfig({
  site: SITE_URL,
  output: 'server',
  // Astro dev-server bind port (see DEV_PORT above). Unset → Astro's default 4321.
  // The `--port` CLI flag, if ever passed, still overrides this.
  server: { port: DEV_PORT },
  adapter: cloudflare({
    imageService: 'passthrough',
  }),

  // El secreto de la costura `gen.render-ratio`, y el único secreto de Worker
  // que este theme lee.
  //
  // Va por `astro:env` y NO por `settings.yaml`: ese fichero se commitea en
  // cada site descendiente, así que un secreto ahí nace publicado. Y no va por
  // `locals` porque el `Runtime` de @astrojs/cloudflare 14 solo expone
  // `cfContext`, sin `env` — el adaptador declara `envGetSecret: 'stable'` y
  // ésta es la puerta que deja abierta.
  //
  // `optional: true` es deliberado y es lo que hace que este cambio sea seguro
  // para toda la flota: el theme es el ANTEPASADO de cada site cliente, y casi
  // ninguno va a tener este secreto. Si fuera obligatorio, añadirlo aquí
  // rompería el arranque de todos los descendientes a la vez. Sin él, el
  // reenvío no sale (`src/lib/render-ratio.ts`) y la landing se sirve igual.
  env: {
    schema: {
      RENDER_RATIO_SECRET: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      // «Páginas como datos» (prototipo). Todas OPCIONALES por la misma razón
      // que la de arriba: sin `PAGES_RENDER_SECRET`, `/__render`, `/__purge` y
      // `?__pv` responden 404 y un descendiente no nota nada. Todas van
      // con `access: 'secret'` aunque solo la primera lo sea: en astro:env un
      // `public` de servidor se HORNEA en el build, y `TEMA_BY_HOST` y los
      // orígenes vienen de `vars` de wrangler en RUNTIME.
      PAGES_RENDER_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      PAGES_ORIGIN: envField.string({ context: 'server', access: 'secret', optional: true }),
      PAGES_HUB_ORIGIN: envField.string({ context: 'server', access: 'secret', optional: true }),
      TEMA_BY_HOST: envField.string({ context: 'server', access: 'secret', optional: true }),
      // siteId del documento en el Hub. Sin él, las páginas públicas usan
      // `forms.siteId` de settings.yaml (y si no, `demo`), pero `/__render`,
      // `/__purge` y `?__pv` responden 404: la firma Hub↔site va atada a él.
      PAGES_SITE_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },

  // Caché de rutas de Astro 7 sobre la caché de Workers: `/p/*` se cachea por
  // tag (`pg:<siteId>:<locale>:<slug>`) y `POST /__purge` la invalida. Solo la
  // usan las rutas que llaman a `Astro.cache.set()`; el resto no cambia.
  cache: { provider: cacheCloudflare() },

  // `checkOrigin` (403 a todo POST con content-type de formulario o text/plain
  // sin `Origin` del propio site) tumbaba `/__render` y `/__purge` antes de
  // llegar a la ruta cuando el Hub manda el cuerpo sin `content-type` (un
  // `fetch` con body string viaja como text/plain). Esas dos rutas van
  // autenticadas por HMAC, que es más fuerte que mirar `Origin`, y el site no
  // tiene ninguna otra ruta que procese un POST (los formularios van al Hub).
  security: { checkOrigin: false },

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
    checkRoutes,
    pagesDatos,
    react(),
    // Standard Astro sitemap. The site is statically prerendered, so it
    // enumerates every page automatically; the i18n option emits hreflang
    // alternates (EN at the root, ES prefixed).
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', es: 'es' },
      },
    }),
    icon(),
    saastroStudio({ autoWrap: true, autoWrapPages: true, include: studioInclude }),
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
      // logs noise before falling back). Tracks the actual dev port (DEV_PORT),
      // falling back to Astro's default when standalone. Harmless standalone —
      // this IS the dev server's own host/port. Dev-only.
      hmr: {
        host: 'localhost',
        protocol: 'ws',
        clientPort: DEV_PORT ?? 4321,
      },
    },
    optimizeDeps: {
      // NO borrar por "config muerta": `use-sync-external-store` no aparece en
      // las `dependencies` de zustand ni en node_modules/ raíz — es una
      // peerDependency OPCIONAL (instalada, 1.6.0, en el store de pnpm). Sin
      // pre-bundlearla, Vite re-optimiza en caliente y el SSR acaba con dos
      // copias de React: "Invalid hook call" + `useState` de null en TODOS los
      // widgets. Comprobado el 17-ago-2026 quitándola: el dev server da 500.
      //
      // Las cuatro siguientes, por la misma causa (30-sep-2026): con
      // node_modules/.vite apartado, Vite las descubría DURANTE el primer
      // arranque o la primera petición y recargaba a mitad. `noop` tumbaba el
      // primer `astro dev` («file does not exist … deps_ssr/…js»); las otras
      // tres daban 500 en la primera GET / con 10 «Invalid hook call» (React
      // nulo en Announcement, CookieBanner, WhatsAppWidget, ContactSheetButton,
      // NavigationMenu). Con ellas aquí: arranque a la primera, 0 recargas y 0
      // «Invalid hook call» en /, /es/, /about y un 404. Si el log de dev vuelve
      // a decir «dependency optimized: X» tras arrancar, X va a esta lista.
      include: [
        'use-sync-external-store/shim/index.js',
        'use-sync-external-store/shim/with-selector.js',
        'astro/assets/services/noop',
        'astro/logger/console',
        'astro-icon/components',
        '@saastro/studio/middleware',
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
