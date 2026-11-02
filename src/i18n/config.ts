/**
 * i18n configuration. ESTA es la única fuente de verdad de los idiomas:
 * `astro.config.mjs` (i18n de Astro, sitemap, Studio), las traducciones, la
 * colección legal y las rutas derivan de aquí. Guía: docs/idiomas.md.
 *
 * - `defaultLocale`: idioma sin prefijo (`/about`); el resto va con prefijo (`/es/about`).
 * - `locales`: los idiomas del site. UN solo idioma = una lista de un elemento
 *   (sin prefijos, sin selector de idioma).
 * - `enabled: false` = «solo el idioma base», igual que dejar en la lista solo el base.
 *
 * Cada idioma de `locales` EXIGE `src/i18n/translations/<locale>.json` (si falta,
 * el build FALLA) y una entrada en `src/lib/not-found.ts` y en `localeLabels`.
 * Un `.json` o una carpeta `src/content/legal/<loc>/` de un idioma no declarado
 * se ignoran.
 *
 * Los valores van como LITERALES en el objeto de abajo: los scripts de check
 * (`scripts/lib/default-locale.mjs`) los leen con una expresión regular. Por eso
 * este comentario no repite esas líneas de ejemplo.
 */
export const i18nConfig = {
  enabled: true,
  defaultLocale: 'en',
  locales: ['en', 'es'],
} as const;

export type Locale = (typeof i18nConfig.locales)[number];
export const defaultLocale: Locale = i18nConfig.defaultLocale;
/** Idiomas EFECTIVOS: con `enabled: false`, solo el base. */
export const locales: readonly Locale[] = i18nConfig.enabled
  ? i18nConfig.locales
  : [i18nConfig.defaultLocale];

export const localeLabels: Record<Locale, string> = {
  en: 'EN',
  es: 'ES',
};
