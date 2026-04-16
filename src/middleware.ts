import { sequence } from 'astro:middleware';
import { defineMiddleware } from 'astro:middleware';
import { onRequest as cmsAuth } from '@saastro/cms/middleware';
import { i18nConfig } from './i18n/config';
import { getLocaleFromUrl, getTranslations, localePath } from './i18n/utils';
import { encodeTranslations, shouldEncodeForRequest } from '@saastro/cms/stega';

const i18n = defineMiddleware(async (context, next) => {
  // If i18n is disabled, pass through without locale detection
  if (!i18nConfig.enabled) return next();

  // If locals are already set by a previous rewrite, skip detection
  if (context.locals.lang) return next();

  const lang = getLocaleFromUrl(context.url.pathname);
  const rawTranslations = getTranslations(lang);

  // Apply stega encoding when visual editor session is active.
  const cookieHeader = context.request.headers.get('cookie');
  const isEditorSession =
    shouldEncodeForRequest(cookieHeader) ||
    context.url.searchParams.has('__saastrocms_visual');
  const t = isEditorSession ? encodeTranslations(rawTranslations, lang) : rawTranslations;

  context.locals.lang = lang;
  context.locals.t = t;
  context.locals.localePath = (path: string) => localePath(lang, path);

  // For non-default locales, rewrite the URL to strip the locale prefix
  if (lang !== i18nConfig.defaultLocale) {
    const stripped = context.url.pathname.replace(`/${lang}`, '') || '/';
    return context.rewrite(stripped);
  }

  return next();
});

// CMS auth runs first (protects /admin/* and /api/cms/*), then i18n
export const onRequest = sequence(cmsAuth, i18n);
