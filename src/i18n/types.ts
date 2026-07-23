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
  /** Floating WhatsApp click-to-chat widget (SiteLayout, `client:idle`).
   *  Omit the block to hide the widget. `number` is digits-only (country code
   *  included, no `+`); `prefill` is the pre-filled chat message. */
  whatsapp?: {
    number: string;
    prefill: string;
    name: string;
    role: string;
    greeting: string;
    cta: string;
    ariaOpen: string;
    ariaClose: string;
  };
  /** Theme toggle a11y label (sr-only). Editable section so the Studio i18n
   *  scan finds it already wrapped + marked (no orphan marker bug). Always
   *  shipped by the theme (en + es), so required. */
  toggle_theme: {
    span: {
      toggle_theme: string;
    };
  };
  /** Landing pages (/lp/<slug>) chrome copy: the FAQ heading + the placeholder
   *  shown when no Hub site is connected yet (forms.siteId empty). The landing
   *  CONTENT itself lives in the `landings` collection, never here. Widget copy
   *  like `contactForm` — NOT a marked Studio section. Always shipped by the
   *  theme (en + es), so required. */
  lp: {
    faqTitle: string;
    notConfigured: {
      title: string;
      body: string;
      hint: string;
    };
  };
  [key: string]: unknown;
}
