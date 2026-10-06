import { defineMiddleware, sequence } from 'astro:middleware';
import { applySecurityHeaders } from './lib/security-headers';
import { i18nConfig } from './i18n/config';
import { getLocaleFromUrl, getTranslations, localePath } from './i18n/utils';
import { I18N_READS_ENABLED, injectReads, trackReads } from './i18n/reads';

/**
 * Cabeceras de seguridad en TODA respuesta que genere el Worker — las landings
 * `/lp/*` (`prerender = false`) y los 404 —, que son justo a las que
 * `public/_headers` NO llega. Va primero en el `sequence()` para que su
 * `next()` envuelva al resto, redirecciones incluidas. Ver
 * `src/lib/security-headers.ts`, donde está el porqué de cada cabecera y la
 * regla de mantener las DOS listas a la par.
 *
 * Una respuesta de `Response.redirect()` (o de un `fetch()` reenviado) trae las
 * cabeceras INMUTABLES: escribirlas lanza «Can't modify immutable headers» y la
 * redirección sale como 500. Entonces se viste una COPIA
 * (`new Response(body, response)` conserva estado, `Location` y cuerpo).
 * Lo vigila `scripts/cabeceras-worker-check.mjs` con una ruta que lo hace.
 */
const securityHeaders = defineMiddleware(async (_context, next) => {
  const response = await next();
  try {
    applySecurityHeaders(response.headers);
    return response;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const mutable = new Response(response.body, response);
    applySecurityHeaders(mutable.headers);
    return mutable;
  }
});

/**
 * i18n middleware — populates `locals.lang` / `locals.t` / `locals.localePath`
 * from the request URL so pages and components render the right locale.
 *
 * The site is statically prerendered (`[...locale]/*` with getStaticPaths, default
 * locale at the root). This runs at build time for every prerendered path, so
 * `Astro.url` is the real public URL — no rewrite, no path patching needed.
 *
 * Auth (the old `@saastro/cms` admin guard) and the visual-editor stega encoding
 * were removed: Saastro Studio instruments the page with build-time `data-saastro`
 * markers, so there's no request-time encoding or auth here.
 */
const site = defineMiddleware(async (context, next) => {
  // If i18n is disabled, pass through without locale detection.
  if (!i18nConfig.enabled) return next();

  // Already populated (e.g. nested render) — skip.
  if (context.locals.lang) return next();

  const lang = getLocaleFromUrl(context.url.pathname);

  context.locals.lang = lang;
  context.locals.localePath = (path: string) => localePath(lang, path);

  // Build de `pnpm studio:check` (PUBLIC_SAASTRO_I18N_READS=1): apunta qué
  // claves i18n lee la página y lo emite en el HTML para el invariante
  // `i18n-consumo`. En el build de producción la rama no existe (Vite
  // sustituye la constante y la elimina). Ver src/i18n/reads.ts.
  if (!I18N_READS_ENABLED) {
    context.locals.t = getTranslations(lang);
    return next();
  }
  const reads = new Set<string>();
  context.locals.t = trackReads(getTranslations(lang), reads);
  const response = await next();
  if (!response.headers.get('content-type')?.includes('text/html')) return response;
  const html = await response.text(); // consumir el cuerpo = terminar de renderizar
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(injectReads(html, reads), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

export const onRequest = sequence(securityHeaders, site);
