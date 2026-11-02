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
 *
 * VARIOS IDS: el valor de un proveedor puede ser una cadena con ids separados por
 * comas (el Hub solo sabe escribir cadenas). Se parte, se recorta, se valida CADA
 * id con el patrón del proveedor, se descartan con aviso los inválidos, se
 * deduplica y se aplica el tope (`maxIds` del catálogo, por defecto 5). Un valor
 * con un solo id se comporta exactamente como antes.
 *
 * EXENTOS: un proveedor `category: "none"` con `exemptReason` (hoy Cloudflare Web
 * Analytics) carga sin puerta de consentimiento y NO entra en `consentKeys`: la
 * versión del consentimiento (cookies.ts) solo cuenta los que sí piden permiso.
 */
import catalogo from './tracking-providers.json';
import type { SiteSettings } from './settings';

export type ConsentCategory = 'analytics' | 'marketing' | 'any' | 'none';

/** Tope de ids por proveedor si el catálogo no dice otra cosa. */
export const MAX_IDS_POR_DEFECTO = 5;

export interface ProviderDef {
  key: string;
  label: string;
  category: ConsentCategory;
  pattern: string;
  /** Ancla de la política de cookies (invariante 8e). Un exento no la lleva. */
  marker?: string;
  legacy?: readonly string[];
  /** Ids máximos en una lista separada por comas. */
  maxIds?: number;
  /** Solo con `category: 'none'`: por qué no pide consentimiento. */
  exemptReason?: string;
}

export interface EnabledProvider {
  key: string;
  /** Primer id (compat con quien leía `id`). */
  id: string;
  /** Todos los ids válidos, sin duplicados, en el orden escrito. */
  ids: string[];
  category: ConsentCategory;
}

export interface RejectedId {
  key: string;
  /** 'formato': no cumple el patrón. 'no-cadena': YAML lo leyó como número/booleano
   *  (un id sin comillas, o `true`/`false`; los de 15+ dígitos pierden precisión): hay que entrecomillarlo.
   *  'tope': sobran ids sobre `maxIds` (se usan los primeros). */
  reason: 'formato' | 'no-cadena' | 'tope';
  /** Solo con 'tope': cuántos ids se usan. */
  max?: number;
}

/** Conversión de Google Ads: etiqueta y la cuenta `AW-…` a la que pertenece. */
export interface AdsConversion {
  id: string;
  label: string;
}

export interface ResolvedTracking {
  providers: EnabledProvider[];
  /** Etiqueta de conversión de Google Ads (`AW-…/<label>`), si es válida (la primera, compat). */
  googleAdsConversionLabel: string;
  /** Conversiones de Google Ads por cuenta: la etiqueta i-ésima va con el id i-ésimo
   *  (una sola etiqueta = la del primer id). Una cuenta sin etiqueta no emite conversión. */
  googleAdsConversions: AdsConversion[];
  /** Claves de los proveedores que PIDEN consentimiento (sin los exentos). Es lo que
   *  entra en la versión del consentimiento (`consentCovers`) y en el banner. */
  consentKeys: string[];
  /** ¿Hay algo que dependa de la categoría marketing? Decide si el banner la muestra. */
  showMarketing: boolean;
  rejected: RejectedId[];
}

export const PROVIDERS: readonly ProviderDef[] = catalogo.providers as ProviderDef[];

/** ¿Está exento de consentimiento? Exige la categoría `none` Y un motivo escrito:
 *  una `none` sin motivo NO es exención (cae del lado de pedir consentimiento). */
export function isExempt(def: Pick<ProviderDef, 'category' | 'exemptReason'>): boolean {
  return def.category === 'none' && typeof def.exemptReason === 'string' && def.exemptReason.trim() !== '';
}

type Loose = Record<string, unknown>;

/** Propiedad PROPIA de un objeto (nunca de su prototipo: `__proto__`, `constructor`…). */
function propio(o: unknown, k: string): unknown {
  return o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k)
    ? (o as Loose)[k]
    : undefined;
}

/** Cadena recortada; '' si no hay valor; `null` si hay un valor que NO es cadena. */
function leer(obj: unknown, ruta: readonly string[]): string | null {
  const cur = ruta.reduce<unknown>((acc, k) => propio(acc, k), obj);
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
  const vacio: ResolvedTracking = {
    providers: [], googleAdsConversionLabel: '', googleAdsConversions: [], consentKeys: [], showMarketing: false, rejected: [],
  };
  if (opts.noindex) return vacio;

  const providers: EnabledProvider[] = [];
  const rejected: RejectedId[] = [];
  let adsPos: number[] = [];

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
    const valor = (override ?? '').trim() || propio || legado || '';
    if (!valor) continue;
    const tope = def.maxIds ?? MAX_IDS_POR_DEFECTO;
    const ids: string[] = [];
    const posiciones: number[] = []; // posición en el valor escrito (para emparejar etiquetas de conversión; los huecos cuentan)
    const re = new RegExp(def.pattern);
    valor.split(',').forEach((crudo, i) => {
      const id = crudo.trim();
      if (id === '') return;
      if (!re.test(id)) { rejected.push({ key: def.key, reason: 'formato' }); return; }
      if (ids.includes(id)) return;
      ids.push(id);
      posiciones.push(i);
    });
    if (ids.length > tope) {
      rejected.push({ key: def.key, reason: 'tope', max: tope });
      ids.length = tope;
      posiciones.length = tope;
    }
    if (ids.length === 0) continue;
    // Una `none` SIN motivo no es exención: falla cerrado, como analytics (pide consentimiento).
    providers.push({ key: def.key, id: ids[0], ids, category: def.category === 'none' && !isExempt(def) ? 'analytics' : def.category });
    if (def.key === 'googleAds') adsPos = posiciones;
  }

  const etiqueta = leer(settings.tracking, ['googleAdsConversionLabel']);
  if (etiqueta === null) rejected.push({ key: 'googleAdsConversionLabel', reason: 'no-cadena' });
  // Una etiqueta por cuenta, en el mismo orden que los ids de googleAds (puede haber
  // huecos: `a,,b`). Una etiqueta inválida se descarta con aviso; una sin cuenta de
  // Google Ads no significa nada.
  const reEtiqueta = new RegExp(catalogo.googleAdsConversionLabelPattern);
  const etiquetas = (etiqueta ?? '').split(',').map((x) => x.trim());
  const ads = providers.find((p) => p.key === 'googleAds');
  const googleAdsConversions: AdsConversion[] = [];
  etiquetas.forEach((l, i) => {
    if (l === '') return;
    if (!reEtiqueta.test(l)) { rejected.push({ key: 'googleAdsConversionLabel', reason: 'formato' }); return; }
    const k = adsPos.indexOf(i);
    if (ads && k !== -1 && !googleAdsConversions.some((c) => c.id === ads.ids[k])) {
      googleAdsConversions.push({ id: ads.ids[k], label: l });
    }
  });

  return {
    providers,
    googleAdsConversionLabel: googleAdsConversions[0]?.label ?? '',
    googleAdsConversions,
    consentKeys: providers.filter((p) => p.category !== 'none').map((p) => p.key),
    showMarketing: providers.some((p) => p.category === 'marketing' || p.category === 'any'),
    rejected,
  };
}
