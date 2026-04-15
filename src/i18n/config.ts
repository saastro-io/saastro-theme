/**
 * i18n configuration — edit this to enable/disable internationalization.
 *
 * Set `enabled: false` (or remove i18n/) to run single-language (SSG-safe).
 * Set `enabled: true` and configure locales to activate the middleware.
 */
export const i18nConfig = {
  enabled: true,
  defaultLocale: 'en',
  locales: ['en', 'es'],
} as const;

export type Locale = (typeof i18nConfig.locales)[number];
export const defaultLocale = i18nConfig.defaultLocale;
export const locales = i18nConfig.locales;

export const localeLabels: Record<Locale, string> = {
  en: 'EN',
  es: 'ES',
};
