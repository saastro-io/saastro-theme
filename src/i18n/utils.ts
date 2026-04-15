import { defaultLocale, locales, localeLabels, type Locale } from './config';
import type { Translations } from './types';
import en from './translations/en.json';
import es from './translations/es.json';

const translationMap: Record<Locale, unknown> = { en, es };

/**
 * Deep-merge base (defaultLocale) with override (target locale).
 * Missing keys in the target fall back to the base language.
 */
function deepMerge<T>(base: T, override: unknown): T {
  if (
    base !== null &&
    typeof base === 'object' &&
    !Array.isArray(base) &&
    override !== null &&
    typeof override === 'object' &&
    !Array.isArray(override)
  ) {
    const result = { ...base } as Record<string, unknown>;
    for (const key of Object.keys(base as object)) {
      result[key] = deepMerge(
        (base as Record<string, unknown>)[key],
        (override as Record<string, unknown>)[key],
      );
    }
    return result as T;
  }
  return (override !== undefined && override !== null ? override : base) as T;
}

export function getLocaleFromUrl(pathname: string): Locale {
  for (const locale of locales) {
    if (locale === defaultLocale) continue;
    if (pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`) {
      return locale;
    }
  }
  return defaultLocale;
}

export function getTranslations(locale: Locale): Translations {
  const base = translationMap[defaultLocale] as Translations;
  if (locale === defaultLocale) return base;
  return deepMerge<Translations>(base, translationMap[locale]);
}

export function localePath(locale: Locale, path: string): string {
  if (locale === defaultLocale) return path;
  return `/${locale}${path}`;
}

export function getHreflangEntries(pagePath: string) {
  return locales.map((locale) => ({
    locale,
    href: localePath(locale, pagePath),
  }));
}

export interface LocaleLink {
  locale: Locale;
  label: string;
  href: string;
  isCurrent: boolean;
}

export function getLocaleLinks(pagePath: string, currentLocale: Locale): LocaleLink[] {
  return locales.map((locale) => ({
    locale,
    label: localeLabels[locale],
    href: localePath(locale, pagePath),
    isCurrent: locale === currentLocale,
  }));
}
