/**
 * Shape of one `lp` collection entry's frontmatter (the landing pages).
 *
 * Mirrors the zod schema in src/content.config.ts. Declared here (not imported
 * as `CollectionEntry<'lp'>['data']`) so the layouts and route share one
 * explicit type that does not depend on Astro's generated content types being
 * in sync while editing.
 */
export interface LandingBullet {
  title: string;
  description: string;
}

export interface LandingFaqItem {
  q: string;
  a: string;
}

export type LandingLayout = 'hero-form' | 'largo';

export interface LandingData {
  title: string;
  subtitle: string;
  metaTitle?: string;
  metaDescription?: string;
  eyebrow?: string;
  layout: LandingLayout;
  form: string;
  formTitle?: string;
  formNote?: string;
  image?: string;
  imageAlt: string;
  badge?: string;
  priceNote?: string;
  // A bullet is a plain one-line fact (string) or a title+description pair.
  bullets: (string | LandingBullet)[];
  faq: LandingFaqItem[];
  disclaimer?: string;
  order: number;
  draft: boolean;
}

/**
 * Copy shown in place of the form when no Hub site is wired up yet
 * (`forms.siteId` empty). The STRINGS live in i18n (`lp.notConfigured` in
 * src/i18n/translations/{en,es}.json) — the theme is bilingual, so no
 * hardcoded copy in this module; the route feeds the localized object down.
 */
export interface LandingNotConfiguredCopy {
  title: string;
  body: string;
  hint: string;
}
