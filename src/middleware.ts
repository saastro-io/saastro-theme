import { defineMiddleware } from 'astro:middleware';
import { i18nConfig } from './i18n/config';
import { getLocaleFromUrl, getTranslations, localePath } from './i18n/utils';

/**
 * i18n middleware — populates `locals.lang` / `locals.t` / `locals.localePath`
 * from the request URL so pages and components can render the right locale.
 *
 * Auth (the old `@saastro/cms` admin guard) and the visual-editor stega
 * encoding were removed: Saastro Studio instruments the page with build-time
 * `data-saastro` markers, so there's no request-time encoding or auth here.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  // If i18n is disabled, pass through without locale detection.
  if (!i18nConfig.enabled) return next();

  // If locals are already set by a previous rewrite, skip detection.
  if (context.locals.lang) return next();

  const lang = getLocaleFromUrl(context.url.pathname);

  context.locals.lang = lang;
  context.locals.t = getTranslations(lang);
  context.locals.localePath = (path: string) => localePath(lang, path);

  return next();
});
