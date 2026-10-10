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
 * `caches.default` es por centro de datos: el borrado vale en el que atiende
 * la purga; en los demás el documento caduca solo (60 s). Las copias de HTML
 * guardadas en el borde ANTES del arreglo (1 día, clave sin host) las contesta
 * el borde sin invocar al Worker: tras desplegar hay que purgarlas una vez
 * (Purge Everything de la zona, o por tag `pg:…` / `astro-path:/…/p/<slug>`).
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
