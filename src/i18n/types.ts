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
    home: string;
    about: string;
    contact: string;
    [key: string]: string;
  };
  footer: {
    copyright: string;
    privacyLink: string;
    termsLink: string;
    cookiesLink: string;
    manageCookies: string;
    [key: string]: string;
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
