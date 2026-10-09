import type { APIRoute } from 'astro';
import { handlePurge } from '../lib/pages/handlers';
import { pagesRuntime } from '../lib/pages/runtime';

/**
 * `POST /__purge` — el Hub lo llama al publicar: cuerpo
 * `{ tags: ["pg:<siteId>:<locale>:<slug>"] }` firmado en `x-saastro-sig`, y se
 * invalida la caché de rutas por tag. Sin `PAGES_RENDER_SECRET`, 404.
 */
export const prerender = false;

export const ALL: APIRoute = async ({ request, locals, cache }) => {
  const rt = pagesRuntime(locals);
  return handlePurge(request, rt.secret, (tags) => cache.invalidate({ tags }));
};
