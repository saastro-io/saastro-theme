/**
 * pwa.ts — el web manifest es OPT-IN.
 *
 * Un enlace al manifest en el `<head>` hace que Chrome/Edge ofrezcan «Instalar app». En una web
 * normal o en una landing de anuncios eso es ruido (y el nombre/color del theme se
 * heredaban a cada descendiente). Por eso el manifest SOLO existe si el site lo activa en
 * `settings.yaml` (`pwa.enabled: true`). Apagado (por defecto): ni `<link>`, ni ruta
 * `/manifest.webmanifest`, ni fichero estático.
 *
 * Una sola resolución para las dos puertas (BaseLayout emite el `<link>`, la ruta emite el
 * JSON): si una dice «no», la otra también. No añadas precedencia propia en ninguna.
 *
 * Los iconos siguen siendo los de `public/` (los genera `scripts/gen-favicons.mjs`). Un
 * site que active la PWA debe haber puesto los suyos (docs/nuevo-site-checklist.md).
 */
import type { SiteSettings } from './settings';

/** Ruta pública del manifest (la sirve `src/pages/manifest.webmanifest.ts`). */
export const PWA_MANIFEST_PATH = '/manifest.webmanifest';
export const PWA_MANIFEST_TYPE = 'application/manifest+json; charset=utf-8';

const HEX = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_THEME = '#00a897';
const FALLBACK_BACKGROUND = '#ffffff';

export interface ResolvedPwa {
  readonly name: string;
  readonly shortName: string;
  readonly themeColor: string;
  readonly backgroundColor: string;
  /** Campos de settings.yaml con valor inválido (se usó el respaldo): para avisar en el build. */
  readonly rejected: readonly string[];
}

type PwaInput = Pick<SiteSettings, 'site'> & { readonly pwa?: unknown };

const cadena = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** `null` = PWA apagada. Solo `true` (o la cadena "true", que es lo único que sabe escribir el Hub) la enciende. */
export function resolvePwa(settings: PwaInput): ResolvedPwa | null {
  const raw = settings.pwa;
  if (raw === null || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (!(p.enabled === true || p.enabled === 'true')) return null;

  const rejected: string[] = [];
  const color = (key: 'themeColor' | 'backgroundColor', fallback: string): string => {
    const v = cadena(p[key]);
    if (v === '') return fallback;
    if (HEX.test(v)) return v;
    rejected.push(`pwa.${key}`);
    return fallback;
  };

  const name = cadena(p.name) || cadena(settings.site?.name) || 'App';
  const shortName = cadena(p.shortName) || name;
  const siteTheme = cadena(settings.site?.favicon?.colors?.theme);
  return {
    name,
    shortName,
    themeColor: color('themeColor', HEX.test(siteTheme) ? siteTheme : FALLBACK_THEME),
    backgroundColor: color('backgroundColor', FALLBACK_BACKGROUND),
    rejected,
  };
}

export function buildManifest(pwa: ResolvedPwa) {
  return {
    name: pwa.name,
    short_name: pwa.shortName,
    start_url: '/',
    display: 'standalone',
    background_color: pwa.backgroundColor,
    theme_color: pwa.themeColor,
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
