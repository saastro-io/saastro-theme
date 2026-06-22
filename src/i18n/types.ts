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
