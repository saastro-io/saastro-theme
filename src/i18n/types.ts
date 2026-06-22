/**
 * Base translation shape for the saastro-theme.
 * Extend this interface in your project to add page-specific keys.
 *
 * Example:
 *   interface MyTranslations extends Translations {
 *     hero: { title: string; subtitle: string };
 *     services: { heading: string; items: string[] };
 *   }
 */
export interface Translations {
  meta: {
    title: string;
    description: string;
    /** Site-wide brand name (og:site_name + footer). Editable from the Hub. */
    siteName?: string;
    /** Default OG/social image (absolute URL or site-root path). */
    ogImage?: string;
    /** Per-page SEO overrides, keyed by page (`home`, `about`, `blog`).
     *  Each field falls back to the global `meta.*` default. */
    pages?: Record<string, { title?: string; description?: string; ogImage?: string }>;
  };
  nav: {
    /** Editable nav items — `key` resolves to a route in SiteLayout. */
    menu: { key: string; title: string }[];
    contact: string;
  };
  footer: {
    copyright: string;
    legalLabel: string;
    /** Editable footer legal links — `key` resolves to a route in SiteLayout. */
    legal: { key: string; title: string }[];
    manageCookies: string;
  };
  announcement: {
    text: string;
    badge: string;
  };
  contactForm: {
    sheetTitle: string;
    sheetDescription: string;
    privacyNotice: string;
    privacyPolicyLinkText: string;
  };
  cookieBanner: {
    title: string;
    description: string;
    policyLinkText: string;
    acceptAll: string;
    rejectAll: string;
    customize: string;
    savePreferences: string;
    essentialLabel: string;
    essentialDescription: string;
    analyticsLabel: string;
    analyticsDescription: string;
    personalizationLabel: string;
    personalizationDescription: string;
    alwaysActive: string;
  };
  [key: string]: unknown;
}
