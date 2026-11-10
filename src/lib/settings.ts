/**
 * settings.ts — typed access to src/data/settings.yaml
 *
 * Reads the YAML at build time via Vite's ?raw import + yaml parser.
 * All values are exposed through getSettings() which returns a frozen object.
 *
 * This shape is trimmed to exactly what the theme consumes (SEO meta, analytics,
 * favicon color, site name, forms wiring). Content is edited via i18n, structural
 * config via saastrocms.config.ts. El aprovisionamiento del Hub escribe solo
 * `forms.siteId` y el bloque `gen` (con `setConfigPath`, que solo escribe
 * cadenas); `tracking.*` y el token de Cloudflare los pone una persona.
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
  /**
   * Píxeles de medición y anuncios (src/lib/tracking.ts + tracking-providers.json).
   * Plano y de solo cadenas (el Hub solo sabe escribir cadenas). Vacío = apagado.
   * `ga4`/`gtm`/`cloudflareWebAnalytics` ganan a `analytics.googleAnalytics/googleTagManager/
   * cloudflareWebAnalytics.token` (la ruta vieja sigue leyéndose como respaldo).
   * Cada valor puede ser UN id o varios separados por comas (`"G-AAA…,G-BBB…"`):
   * se valida cada uno, tope 5 (Clarity y Cloudflare, 1). `googleAdsConversionLabel`
   * admite una etiqueta por cuenta de `googleAds`, en el mismo orden.
   */
  readonly tracking?: {
    readonly ga4?: string;
    readonly gtm?: string;
    readonly googleAds?: string;
    readonly googleAdsConversionLabel?: string;
    readonly metaPixel?: string;
    readonly tiktokPixel?: string;
    readonly linkedinPartnerId?: string;
    readonly clarity?: string;
    /** Token del beacon de Cloudflare Web Analytics (32 hex). Exento de consentimiento. */
    readonly cloudflareWebAnalytics?: string;
  };
  /**
   * Contacto alternativo visible en las landings `/lp/**` (LandingContact). Vacío =
   * sin bloque. Un teléfono o email inválido se descarta (src/lib/lp-contact.ts).
   */
  readonly contact?: {
    readonly phone?: string;
    readonly email?: string;
  };
  readonly forms: {
    readonly siteId: string;
    readonly contactFormSlug: string;
  };
  /**
   * SAASTRO Gen lead-attribution beacon (GenTracking.astro). Empty/absent
   * `workspaceId` = tracking OFF. Toggled per site from the Hub, which writes
   * this block (same mechanism as forms.siteId).
   */
  readonly gen?: {
    readonly workspaceId: string;
    readonly vertical?: string;
    readonly consent?: 'none' | 'required';
  };
  /**
   * Web manifest OPT-IN (src/lib/pwa.ts). Ausente o `enabled: false` = sin
   * enlace al manifest, sin ruta `/manifest.webmanifest` y sin «Instalar app».
   * `name`/`shortName` caen a `site.name`; `themeColor` a `site.favicon.colors.theme`;
   * `backgroundColor` a #ffffff. Colores `#rrggbb`; uno inválido se descarta con aviso.
   */
  readonly pwa?: {
    readonly enabled?: boolean;
    readonly name?: string;
    readonly shortName?: string;
    readonly themeColor?: string;
    readonly backgroundColor?: string;
  };
  /**
   * «Página en construcción» OPT-IN (src/lib/maintenance.ts). Ausente o
   * `enabled: false` = el site no pregunta nunca al Hub. Encendido, consulta
   * `/api/_public/maintenance/<forms.siteId>` y, si el Hub dice que está en
   * obras, sirve un 503 (salvo `?pase=` válido). Falla abierto.
   */
  readonly maintenance?: {
    readonly enabled?: boolean;
  };
  /**
   * Medición render-vs-JS (src/lib/render-ratio.ts). `renderRatio: false` =
   * apagado, y entonces ni se emiten los pings ni existe la ruta /mx/*.gif.
   */
  readonly measure?: {
    readonly renderRatio?: boolean;
    readonly sink?: import('./render-ratio').MeasureSink;
    readonly genEndpoint?: string;
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
