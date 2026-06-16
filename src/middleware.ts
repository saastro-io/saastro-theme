import { sequence, defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
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

  return next();
});

// @saastro/cms uses Astro.locals.runtime.env which throws in @astrojs/cloudflare v13.
// Patch the throwing getter to return null so the CMS auth falls back gracefully
// (session = null, proceeds as unauthenticated) until the CMS is updated for v6.
const cmsAuthCompat = defineMiddleware(async (context, next) => {
  const runtime = context.locals.runtime as Record<string, unknown> | null | undefined;
  if (runtime) {
    try {
      Object.defineProperty(runtime, 'env', {
        configurable: true,
        enumerable: true,
        get: () => env,
      });
    } catch {
      // already patched or non-configurable — ignore
    }
  }
  return cmsAuth(context, next);
});

// CMS auth runs first (protects /admin/* and /api/cms/*), then i18n
export const onRequest = sequence(cmsAuthCompat, i18n);
