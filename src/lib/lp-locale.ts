import { defaultLocale, locales } from '../i18n/config';

/**
 * Idioma de las landings `/lp/**` (SSR). Las rutas son `[...locale]/lp/…`, así
 * que el parámetro `locale` es lo que haya delante de `/lp`: vacío (idioma base,
 * sin prefijo) o cualquier cosa que escriba el visitante (`/zz/lp/x`).
 *
 * Decisión pura, sin Astro, para poder probarla: el prefijo solo vale si es un
 * idioma de `locales` que NO sea el base (el base va sin prefijo); si no, 404 (no se redirige a la home: eso es solo para
 * slugs). Misma regla de segmento completo que `getLocaleFromUrl`.
 */
export function lpLocaleFromParam(
  param: string | undefined,
  cfg: { defaultLocale: string; locales: readonly string[] } = { defaultLocale, locales },
): { ok: true; lang: string } | { ok: false } {
  if (param === undefined || param === '') return { ok: true, lang: cfg.defaultLocale };
  // El idioma base no lleva prefijo (como en las páginas normales): `/en/lp/x` con base en es 404.
  return param !== cfg.defaultLocale && cfg.locales.includes(param)
    ? { ok: true, lang: param }
    : { ok: false };
}

/** Texto por idioma: el del idioma pedido; si no existe, el del idioma BASE; y solo
 *  si la plantilla tampoco lo trae, `last` (la plantilla siempre trae uno). */
export function pickByLocale<T>(
  map: Record<string, T>,
  lang: string,
  base: string = defaultLocale,
  last: string = 'en',
): T {
  return map[lang] ?? map[base] ?? map[last];
}
