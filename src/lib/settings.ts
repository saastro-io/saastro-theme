/**
 * settings.ts — typed access to src/data/settings.yaml
 *
 * Reads the YAML at build time via Vite's ?raw import + yaml parser.
 * All values are exposed through getSettings() which returns a frozen object.
 */
import settingsRaw from '../data/settings.yaml?raw';
import { parse } from 'yaml';

export interface SiteSettings {
  readonly site: {
    readonly name: string;
    readonly site: string;
    readonly base: string;
    readonly trailingSlash: string;
    readonly googleSiteVerificationId?: string;
    readonly favicon: {
      readonly colors: {
        readonly icon: string;
        readonly theme: string;
      };
    };
  };
  readonly i18n: {
    readonly language: string;
    readonly textDirection: string;
  };
  readonly metadata: {
    readonly title: {
      readonly default: string;
      readonly template: string;
    };
    readonly description: string;
    readonly robots: {
      readonly index: boolean;
      readonly follow: boolean;
    };
    readonly openGraph: {
      readonly type: string;
      readonly site_name: string;
      readonly images: readonly string[];
    };
    readonly twitter: {
      readonly card: string;
    };
  };
  readonly apps: {
    readonly blog: {
      readonly isEnabled: boolean;
      readonly list: {
        readonly pathname: string;
        readonly robots: { readonly index: boolean; readonly follow: boolean };
      };
      readonly category: { readonly pathname: string };
      readonly tag: { readonly pathname: string };
      readonly post: {
        readonly permalink: string;
        readonly robots: { readonly index: boolean; readonly follow: boolean };
      };
      readonly postsPerPage: number;
    };
  };
  readonly ui: {
    readonly theme: string;
  };
  readonly analytics: {
    readonly googleAnalytics: {
      readonly id: string;
    };
    readonly googleTagManager: {
      readonly id: string;
    };
  };
  readonly cookieConsent: {
    readonly privacyPolicyUrl: string;
    readonly position: string;
    readonly theme: string;
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
