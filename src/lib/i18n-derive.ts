/**
 * Todo lo que se DERIVA de `src/i18n/config.ts`, en funciones puras para poder
 * probarlas (`i18n-derive.test.ts`) y para que `astro.config.mjs`,
 * `content.config.ts`, `utils.ts` y las rutas lean la MISMA lista de idiomas.
 * Este fichero no importa nada del proyecto: lo carga también Node a pelo desde
 * `astro.config.mjs`.
 */

export interface I18nInput {
  enabled: boolean;
  defaultLocale: string;
  locales: readonly string[];
}

/** Idiomas efectivos: `enabled: false` equivale a `locales: [defaultLocale]`. */
export function effectiveLocales(cfg: I18nInput): string[] {
  const list = cfg.enabled ? [...cfg.locales] : [cfg.defaultLocale];
  if (!list.includes(cfg.defaultLocale)) {
    throw new Error(
      `[i18n] defaultLocale '${cfg.defaultLocale}' no está en locales [${list.join(', ')}] (src/i18n/config.ts).`,
    );
  }
  return list;
}

/** Bloque `i18n` de `astro.config.mjs`. */
export function astroI18n(cfg: I18nInput) {
  return {
    defaultLocale: cfg.defaultLocale,
    locales: effectiveLocales(cfg),
    routing: 'manual' as const,
  };
}

/** Opción `i18n` del sitemap: con UN idioma no hay alternates (`undefined`). */
export function sitemapI18n(cfg: I18nInput) {
  const list = effectiveLocales(cfg);
  if (list.length < 2) return undefined;
  return {
    defaultLocale: cfg.defaultLocale,
    locales: Object.fromEntries(list.map((l) => [l, l])),
  };
}

/** `pages.locales` de Studio: el base primero. */
export function studioLocales(cfg: I18nInput): string[] {
  const list = effectiveLocales(cfg);
  return [cfg.defaultLocale, ...list.filter((l) => l !== cfg.defaultLocale)];
}

/** Glob de la colección legal: SOLO las carpetas de idiomas declarados.
 *  (Una llave de un solo elemento, `{es}`, no casa en el glob: con uno va sin llaves.) */
export function legalGlob(cfg: I18nInput): string {
  const list = effectiveLocales(cfg);
  return list.length === 1 ? `${list[0]}/*.md` : `{${list.join(',')}}/*.md`;
}

/** Entradas legales (`<loc>/<slug>`) que dan página: solo las de idiomas declarados. */
export function legalEntryParams(
  ids: readonly string[],
  cfg: I18nInput,
): { locale: string | undefined; slug: string }[] {
  const list = effectiveLocales(cfg);
  const out: { locale: string | undefined; slug: string }[] = [];
  for (const id of ids) {
    const [loc, ...rest] = id.split('/');
    if (!list.includes(loc)) continue;
    out.push({ locale: loc === cfg.defaultLocale ? undefined : loc, slug: rest.join('/') });
  }
  return out;
}

/**
 * Mapa idioma → traducciones a partir de `import.meta.glob('./translations/*.json')`.
 * Falla (el build NO sale verde) si un idioma declarado no tiene su fichero; un
 * `.json` de un idioma no declarado no se carga.
 */
export function buildTranslationMap(
  modules: Record<string, unknown>,
  cfg: I18nInput,
): Record<string, unknown> {
  const byLocale: Record<string, unknown> = {};
  for (const [path, mod] of Object.entries(modules)) {
    const m = path.match(/([^/\\]+)\.json$/);
    if (m) byLocale[m[1]] = mod;
  }
  const map: Record<string, unknown> = {};
  for (const loc of effectiveLocales(cfg)) {
    if (!(loc in byLocale)) {
      throw new Error(
        `[i18n] Falta la traducción del idioma '${loc}': se esperaba src/i18n/translations/${loc}.json ` +
          `(declarado en src/i18n/config.ts). Créalo o quita '${loc}' de locales. Guía: docs/idiomas.md.`,
      );
    }
    map[loc] = byLocale[loc];
  }
  return map;
}
