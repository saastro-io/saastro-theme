import { defineMiddleware, sequence } from 'astro:middleware';
import { applySecurityHeaders } from './lib/security-headers';
import { getLocaleFromUrl, getTranslations, localePath } from './i18n/utils';
import { I18N_READS_ENABLED, injectReads, trackReads } from './i18n/reads';
import { getSettings } from './lib/settings';
import {
  PASE_COOKIE,
  PASE_PARAM,
  decideMaintenance,
  esRutaExenta,
  parseCookie,
  paseCookie,
  renderMaintenanceHtml,
  resolveMaintenance,
  retryAfterSeconds,
} from './lib/maintenance';

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
 * «Página en construcción» gobernada por el Hub (src/lib/maintenance.ts). OPT-IN
 * (`maintenance.enabled` en settings.yaml): apagado, `next()` sin tocar nada ni
 * llamar al Hub. Para que corra también en las páginas prerenderizadas,
 * `wrangler.jsonc` lleva `assets.run_worker_first`. Falla abierto.
 */
const maintenance = defineMiddleware(async (context, next) => {
  const method = context.request.method;
  if (method !== 'GET' && method !== 'HEAD') return next();
  const settings = getSettings();
  const cfg = resolveMaintenance(settings);
  if (!cfg) return next();
  const { pathname, searchParams } = context.url;
  if (esRutaExenta(pathname)) return next();

  let decision;
  try {
    decision = await decideMaintenance(cfg, {
      queryPase: searchParams.get(PASE_PARAM),
      cookiePase: parseCookie(context.request.headers.get('cookie'), PASE_COOKIE),
    });
  } catch {
    return next(); // cualquier fallo inesperado: el site se sirve
  }

  if (decision.action === 'pass') return next();
  if (decision.action === 'setpase') {
    // Pase válido: cookie y a la misma URL SIN el token (que no quede en enlaces ni en logs de después).
    const clean = new URL(context.url);
    clean.searchParams.delete(PASE_PARAM);
    return new Response(null, {
      status: 302,
      headers: {
        Location: clean.pathname + clean.search,
        'Set-Cookie': paseCookie(decision.token!),
        'Cache-Control': 'no-store',
      },
    });
  }
  const state = decision.state!;
  const lang = getLocaleFromUrl(pathname);
  return new Response(method === 'HEAD' ? null : renderMaintenanceHtml(state, settings.site?.name ?? '', lang), {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Retry-After': String(retryAfterSeconds(state.returnAt)),
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  });
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

export const onRequest = sequence(securityHeaders, maintenance, site);
