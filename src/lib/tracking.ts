/**
 * tracking.ts — qué proveedores de medición/anuncios están ENCENDIDOS en este
 * site. Función pura: la usan BaseLayout y SiteLayout (antes cada uno resolvía
 * los ids por su cuenta) y se prueba sin Astro.
 *
 * Origen de los ids, por orden:
 *   1. `overrides` (props de BaseLayout.analytics — compat con los sites que los pasan)
 *   2. `settings.tracking.<key>`   ← lo que escribirá el Hub
 *   3. `settings.analytics.*`      ← legado (googleAnalytics.id / googleTagManager.id)
 * Vacío = apagado. `noindex` (vista previa de un borrador) apaga TODO: la URL con
 * `?preview=<token>` viajaría a cada proveedor.
 *
 * Un id que no cumple su formato se DESCARTA y se anota en `rejected`: el valor
 * acaba dentro de una URL de script y de código inline, así que un id mal
 * escrito (o hostil) no se inyecta nunca.
 */
import catalogo from './tracking-providers.json';
import type { SiteSettings } from './settings';

export type ConsentCategory = 'analytics' | 'marketing' | 'any';

export interface ProviderDef {
  key: string;
  label: string;
  category: ConsentCategory;
  pattern: string;
  marker: string;
  legacy?: readonly string[];
}

export interface EnabledProvider {
  key: string;
  id: string;
  category: ConsentCategory;
}

export interface RejectedId {
  key: string;
  /** 'formato': no cumple el patrón. 'no-cadena': YAML lo leyó como número/booleano
   *  (un id sin comillas, o `true`/`false`; los de 15+ dígitos pierden precisión): hay que entrecomillarlo. */
  reason: 'formato' | 'no-cadena';
}

export interface ResolvedTracking {
  providers: EnabledProvider[];
  /** Etiqueta de conversión de Google Ads (`AW-…/<label>`), si es válida. */
  googleAdsConversionLabel: string;
  /** ¿Hay algo que dependa de la categoría marketing? Decide si el banner la muestra. */
  showMarketing: boolean;
  rejected: RejectedId[];
}

export const PROVIDERS: readonly ProviderDef[] = catalogo.providers as ProviderDef[];

type Loose = Record<string, unknown>;

/** Cadena recortada; '' si no hay valor; `null` si hay un valor que NO es cadena. */
function leer(obj: unknown, ruta: readonly string[]): string | null {
  let cur: unknown = obj;
  for (const k of ruta) {
    if (cur == null || typeof cur !== 'object') return '';
    cur = (cur as Loose)[k];
  }
  if (cur == null || cur === '') return '';
  return typeof cur === 'string' ? cur.trim() : null;
}

export interface ResolveOptions {
  noindex?: boolean;
  /** `ga4`/`gtm` pasados por props a BaseLayout (compat). */
  overrides?: { googleAnalyticsId?: string; googleTagManagerId?: string };
}

export function resolveTracking(
  settings: Pick<SiteSettings, 'analytics'> & { tracking?: unknown },
  opts: ResolveOptions = {},
): ResolvedTracking {
  const vacio: ResolvedTracking = { providers: [], googleAdsConversionLabel: '', showMarketing: false, rejected: [] };
  if (opts.noindex) return vacio;

  const providers: EnabledProvider[] = [];
  const rejected: RejectedId[] = [];

  for (const def of PROVIDERS) {
    const override =
      def.key === 'ga4' ? opts.overrides?.googleAnalyticsId
      : def.key === 'gtm' ? opts.overrides?.googleTagManagerId
      : undefined;
    const propio = leer(settings.tracking, [def.key]);
    const legado = def.legacy ? leer(settings, def.legacy) : '';
    // `null` = el YAML trae algo que no es una cadena (p. ej. un id numérico sin
    // comillas): se avisa en vez de apagar el proveedor en silencio.
    if ((propio === null && !(override ?? '').trim()) || (propio === '' && legado === null && !(override ?? '').trim())) {
      rejected.push({ key: def.key, reason: 'no-cadena' });
      continue;
    }
    const id = (override ?? '').trim() || propio || legado || '';
    if (!id) continue;
    if (!new RegExp(def.pattern).test(id)) {
      rejected.push({ key: def.key, reason: 'formato' });
      continue;
    }
    providers.push({ key: def.key, id, category: def.category });
  }

  const etiqueta = leer(settings.tracking, ['googleAdsConversionLabel']);
  if (etiqueta === null) rejected.push({ key: 'googleAdsConversionLabel', reason: 'no-cadena' });
  let label = etiqueta ?? '';
  if (label && !new RegExp(catalogo.googleAdsConversionLabelPattern).test(label)) {
    rejected.push({ key: 'googleAdsConversionLabel', reason: 'formato' });
    label = '';
  }
  // Una etiqueta sin cuenta de Google Ads no significa nada.
  if (!providers.some((p) => p.key === 'googleAds')) label = '';

  return {
    providers,
    googleAdsConversionLabel: label,
    showMarketing: providers.some((p) => p.category === 'marketing' || p.category === 'any'),
    rejected,
  };
}
