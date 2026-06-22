import type { Translations } from './types';

export interface ResolvedMeta {
  title?: string;
  description?: string;
  ogImage?: string;
  siteName?: string;
}

/**
 * Resolve SEO/social metadata for a page: a per-page override
 * (`meta.pages[page]`) layered over the global `meta.*` defaults.
 *
 * All of this lives in i18n (per-locale) and is editable from the Saastro Hub's
 * Studio "SEO / Metadata" panel — the theme only reads it here. Content-derived
 * pages (blog posts, legal) set their own title/description from the entry and
 * don't pass a page key.
 */
export function resolveMeta(t: Translations | undefined, page?: string): ResolvedMeta {
  const meta = t?.meta;
  const override = (page && meta?.pages?.[page]) || {};
  return {
    title: override.title ?? meta?.title,
    description: override.description ?? meta?.description,
    ogImage: override.ogImage || meta?.ogImage,
    siteName: meta?.siteName,
  };
}

/**
 * Derive the `meta.pages` key from a route — locale prefix stripped, root →
 * `home` (e.g. `/about` → `about`, `/blog/my-post` → `blog-my-post`). Mirrors
 * the Hub Studio's SEO panel so per-page overrides written there line up with
 * what each page reads here.
 */
export function pageKeyFromPath(path: string, locales: readonly string[]): string {
  const clean = (path || '/').split(/[?#]/)[0];
  const segs = clean.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (segs[0] && (locales as readonly string[]).includes(segs[0])) segs.shift();
  return segs.join('-') || 'home';
}

/**
 * Just the per-page override object — NO global fallback. For pages that already
 * have a content-derived title/description (blog posts, legal docs) and only
 * want an OPTIONAL override from the Studio: `override.title ?? entry.title`.
 * (Unlike `resolveMeta`, which intentionally falls back to the global default.)
 */
export function pageOverride(
  t: Translations | undefined,
  page: string,
): { title?: string; description?: string; ogImage?: string } {
  return t?.meta?.pages?.[page] ?? {};
}
