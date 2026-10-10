import type { APIRoute } from 'astro';
import { handlePurge } from '../lib/pages/handlers';
import { pagesRuntime } from '../lib/pages/runtime';
import { purgeDocs } from '../lib/pages/source';

/**
 * `POST /__purge` — el Hub lo llama al publicar: cuerpo
 * `{ tags: ["pg:<siteId>:<locale>:<slug>"] }` firmado en `x-saastro-sig`.
 * Borra el DOCUMENTO de `caches.default` (`src/lib/pages/source.ts`), que es
 * lo único cacheado de `/p/*` y vale para todos los hosts. Además purga esos
 * tags en la caché de rutas de Cloudflare, por si quedan copias de HTML de
 * antes del arreglo (best-effort: en local no existe y no tumba la purga).
 * Un tag de otro siteId → 400. Sin `PAGES_RENDER_SECRET` o sin
 * `PAGES_SITE_ID`, 404.
 */
export const prerender = false;

export const ALL: APIRoute = async ({ request, locals, cache }) => {
  const rt = pagesRuntime(locals);
  return handlePurge(request, rt.secret, rt.siteIdFirmado, async (tags) => {
    await purgeDocs(rt.source.cache, tags);
    try {
      await cache.invalidate({ tags });
    } catch (err) {
      console.warn(JSON.stringify({ evento: 'pages.purga-ruta-fallida', tags, error: (err as Error)?.message ?? String(err) }));
    }
  });
};
