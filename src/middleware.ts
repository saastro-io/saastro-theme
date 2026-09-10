import { defineMiddleware, sequence } from 'astro:middleware';
import { applySecurityHeaders } from './lib/security-headers';
import { i18nConfig } from './i18n/config';
import { getLocaleFromUrl, getTranslations, localePath } from './i18n/utils';

/**
 * Cabeceras de seguridad en TODA respuesta que genere el Worker — las landings
 * `/lp/*` (`prerender = false`) y los 404 —, que son justo a las que
 * `public/_headers` NO llega. Va primero en el `sequence()` para que su
 * `next()` envuelva al resto, redirecciones incluidas. Ver
 * `src/lib/security-headers.ts`, donde está el porqué de cada cabecera y la
 * regla de mantener las DOS listas a la par.
 */
const securityHeaders = defineMiddleware(async (_context, next) => {
  const response = await next();
  applySecurityHeaders(response.headers);
  return response;
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
  context.locals.t = getTranslations(lang);
  context.locals.localePath = (path: string) => localePath(lang, path);

  return next();
});

export const onRequest = sequence(securityHeaders, site);
