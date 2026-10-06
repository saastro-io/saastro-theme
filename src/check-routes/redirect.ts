import type { APIRoute } from 'astro';

/**
 * Ruta SOLO de `studio:check`: no existe en el build de producción. La inyecta
 * `astro.config.mjs` cuando `SAASTRO_CHECK_ROUTES=1`, y la pide
 * `scripts/cabeceras-worker-check.mjs`.
 *
 * Devuelve un `Response.redirect()` a propósito, y no un `Astro.redirect()`:
 * el estático nace con las cabeceras INMUTABLES, y un middleware que haga
 * `response.headers.set()` sobre él revienta con «Can't modify immutable
 * headers» → 500. Medido en enlolab/pinteach-web el 6-oct-2026 (/t: 301 → 500).
 * Las redirecciones de la plantilla (`/lp/*`, `/blog/*`, `/legal/*`) usan
 * `Astro.redirect`, que es mutable, y por eso ese 500 no se veía aquí.
 */
export const prerender = false;

export const GET: APIRoute = ({ request }) => Response.redirect(new URL('/', request.url), 301);
