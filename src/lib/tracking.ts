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
  reason: 'formato';
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

function leer(obj: unknown, ruta: readonly string[]): string {
  let cur: unknown = obj;
  for (const k of ruta) {
    if (cur == null || typeof cur !== 'object') return '';
    cur = (cur as Loose)[k];
  }
  return typeof cur === 'string' ? cur.trim() : '';
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
    const id =
      (override ?? '').trim() ||
      leer(settings.tracking, [def.key]) ||
      (def.legacy ? leer(settings, def.legacy) : '');
    if (!id) continue;
    if (!new RegExp(def.pattern).test(id)) {
      rejected.push({ key: def.key, reason: 'formato' });
      continue;
    }
    providers.push({ key: def.key, id, category: def.category });
  }

  let label = leer(settings.tracking, ['googleAdsConversionLabel']);
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
