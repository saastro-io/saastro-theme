/**
 * settings.ts — typed access to src/data/settings.yaml
 *
 * Reads the YAML at build time via Vite's ?raw import + yaml parser.
 * All values are exposed through getSettings() which returns a frozen object.
 *
 * This shape is trimmed to exactly what the theme consumes (SEO meta, analytics,
 * favicon color, site name, forms wiring). It is NOT read by the Saastro Hub —
 * content is edited via i18n, structural config via saastrocms.config.ts.
 */
import settingsRaw from '../data/settings.yaml?raw';
import { parse } from 'yaml';

export interface SiteSettings {
  readonly site: {
    readonly name: string;
    readonly googleSiteVerificationId?: string;
    readonly favicon: {
      readonly colors: {
        readonly icon: string;
        readonly theme: string;
      };
    };
  };
  readonly metadata: {
    readonly description: string;
  };
  readonly seo?: {
    // Schema.org @type for the site's primary entity. Empty = emit only WebSite.
    readonly schemaType?: 'Person' | 'Organization' | 'ProfessionalService' | '';
    readonly email?: string;
    // Person-only: the person's role (e.g. "Frontend Engineer").
    readonly jobTitle?: string;
    // Profiles/owned domains Google can cross-reference (LinkedIn, GitHub, …).
    readonly sameAs?: readonly string[];
  };
  readonly analytics: {
    readonly googleAnalytics: {
      readonly id: string;
    };
    readonly googleTagManager: {
      readonly id: string;
    };
    readonly cloudflareWebAnalytics?: {
      readonly token: string;
    };
  };
  readonly forms: {
    readonly siteId: string;
    readonly contactFormSlug: string;
  };
}

let cached: SiteSettings | null = null;

/**
 * Returns the parsed settings.yaml as a typed, frozen object.
 * The result is cached after first call.
 */
export function getSettings(): SiteSettings {
  if (cached !== null) {
    return cached;
  }
  const parsed = parse(settingsRaw) as SiteSettings;
  cached = Object.freeze(parsed);
  return cached;
}
