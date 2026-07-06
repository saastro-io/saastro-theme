import { flattenSpansDeep } from '@saastro/studio/richtext';
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

/**
 * Rich-spans support (Studio spans plan). A translation leaf may be
 * `[{ text, marks? }]` instead of a plain string. `getTranslations`
 * FLATTENS those to concatenated text (canonical helper from
 * @saastro/studio 0.9.0) so every `{t.x.y}` interpolation keeps rendering
 * strings; sections opt into the styled render via `<RichText>` fed from
 * `getRichTranslations`.
 */
const flatCache = new Map<Locale, Translations>();
const richCache = new Map<Locale, Translations>();

/** Merged translations with rich spans flattened to plain strings —
 *  the safe universal view every `{t.…}` interpolation consumes. */
export function getTranslations(locale: Locale): Translations {
  const cached = flatCache.get(locale);
  if (cached) return cached;
  const flat = flattenSpansDeep(getRichTranslations(locale));
  flatCache.set(locale, flat);
  return flat;
}

/** Merged translations with rich spans left INTACT — feed these leaves to
 *  `<RichText>` at call sites that opt into the styled render. */
export function getRichTranslations(locale: Locale): Translations {
  const cached = richCache.get(locale);
  if (cached) return cached;
  const base = translationMap[defaultLocale] as Translations;
  const merged =
    locale === defaultLocale ? base : deepMerge<Translations>(base, translationMap[locale]);
  richCache.set(locale, merged);
  return merged;
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
