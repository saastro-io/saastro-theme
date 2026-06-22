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
