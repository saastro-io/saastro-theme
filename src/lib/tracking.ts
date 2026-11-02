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
  /** `false` = del SITE: una landing no lo puede sobrescribir (Cloudflare, Clarity). */
  perLanding?: boolean;
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
   *  'tope': sobran ids sobre `maxIds` (se usan los primeros).
   *  Solo de una landing: 'clave' (no es una clave sobrescribible por landing) y
   *  'modo' (`trackingMode` no es `add` ni `replace`; se usa `add`). */
  reason: 'formato' | 'no-cadena' | 'tope' | 'clave' | 'modo';
  /** Solo con 'tope': cuántos ids se usan. */
  max?: number;
  /** De dónde viene el valor: los ajustes del site (por defecto) o el frontmatter de la landing. */
  origen?: 'site' | 'landing';
}

/** Mensaje de build para un id descartado (BaseLayout lo escribe con console.warn). */
export function describeRejected(r: RejectedId): string {
  const donde = r.origen === 'landing' ? `landing.tracking.${r.key}` : `settings.tracking.${r.key}`;
  switch (r.reason) {
    case 'no-cadena':
      return `[tracking] ${donde}: el YAML lo lee como número o booleano, no como cadena — ENTRECOMILLA el valor. DESCARTADO`;
    case 'tope':
      return `[tracking] ${donde}: hay más ids de los que admite (máximo ${r.max}) — se usan los ${r.max} primeros y el resto se DESCARTA`;
    case 'clave':
      return `[tracking] ${donde}: no se puede sobrescribir por landing (o no existe) — IGNORADO`;
    case 'modo':
      return `[tracking] landing.trackingMode: valor no válido (solo add o replace) — se usa add`;
    default:
      return `[tracking] ${donde}: id con formato inválido — DESCARTADO (no se inyecta nada)`;
  }
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

export type TrackingMode = 'add' | 'replace';

/** Override de píxeles de UNA landing (frontmatter `tracking:` + `trackingMode:`).
 *  Llega sin validar (el esquema solo exige la forma): lo valida `resolveTracking`,
 *  con las mismas reglas que `settings.tracking`. */
export interface LandingTracking {
  tracking?: unknown;
  mode?: unknown;
}

export interface ResolveOptions {
  noindex?: boolean;
  /** `ga4`/`gtm` pasados por props a BaseLayout (compat). */
  overrides?: { googleAnalyticsId?: string; googleTagManagerId?: string };
  /** Override de la landing que se está sirviendo. Se resuelve POR PETICIÓN y no se
   *  guarda en ningún sitio: la función no tiene estado entre llamadas. */
  landing?: LandingTracking;
}

/** Claves que una landing puede sobrescribir: los proveedores del catálogo que no
 *  son del site, más la etiqueta de conversión de Google Ads. */
export const LANDING_KEYS: readonly string[] = [
  ...PROVIDERS.filter((d) => d.perLanding !== false && !isExempt(d)).map((d) => d.key),
  'googleAdsConversionLabel',
];

interface Parsed {
  ids: string[];
  /** Posición de cada id en el valor escrito (los huecos cuentan: `a,,b`). */
  posiciones: number[];
}

/** Un descarte; `origen` solo se anota si viene de una landing (los del site no cambian de forma). */
function rechazo(key: string, reason: RejectedId['reason'], origen: 'site' | 'landing', max?: number): RejectedId {
  return { key, reason, ...(max !== undefined ? { max } : {}), ...(origen === 'landing' ? { origen } : {}) };
}

/** Parte, recorta, valida con el patrón del proveedor, quita repetidos y aplica el tope. */
function parsear(def: ProviderDef, valor: string, origen: 'site' | 'landing', rejected: RejectedId[]): Parsed {
  const tope = def.maxIds ?? MAX_IDS_POR_DEFECTO;
  const ids: string[] = [];
  const posiciones: number[] = [];
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- el patrón sale del catálogo del propio repo (tracking-providers.json), nunca de la landing ni del visitante; lo que se evalúa contra él es el id, con patrones anclados y acotados
  const re = new RegExp(def.pattern);
  valor.split(',').forEach((crudo, i) => {
    const id = crudo.trim();
    if (id === '') return;
    if (!re.test(id)) { rejected.push(rechazo(def.key, 'formato', origen)); return; }
    if (ids.includes(id)) return;
    ids.push(id);
    posiciones.push(i);
  });
  if (ids.length > tope) {
    rejected.push(rechazo(def.key, 'tope', origen, tope));
    ids.length = tope;
    posiciones.length = tope;
  }
  return { ids, posiciones };
}

/** Empareja una lista de etiquetas con las cuentas `AW-…` por POSICIÓN en el valor escrito.
 *  Una etiqueta inválida se descarta con aviso; una sin cuenta no significa nada. */
function emparejarEtiquetas(
  etiquetaCruda: string | null,
  ads: Parsed | undefined,
  origen: 'site' | 'landing',
  rejected: RejectedId[],
): AdsConversion[] {
  if (etiquetaCruda === null) rejected.push(rechazo('googleAdsConversionLabel', 'no-cadena', origen));
  const reEtiqueta = new RegExp(catalogo.googleAdsConversionLabelPattern);
  const out: AdsConversion[] = [];
  (etiquetaCruda ?? '').split(',').map((x) => x.trim()).forEach((l, i) => {
    if (l === '') return;
    if (!reEtiqueta.test(l)) { rejected.push(rechazo('googleAdsConversionLabel', 'formato', origen)); return; }
    const k = ads ? ads.posiciones.indexOf(i) : -1;
    if (ads && k !== -1 && !out.some((c) => c.id === ads.ids[k])) out.push({ id: ads.ids[k], label: l });
  });
  return out;
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
  let adsSite: Parsed | undefined;
  let adsLanding: Parsed | undefined;

  // Override de la landing. Una clave que no se puede sobrescribir se ignora con aviso
  // (nunca se aplica). El modo desconocido cae a `add`, el que no quita nada.
  const landingRaw = opts.landing?.tracking;
  const landingObj = landingRaw !== null && typeof landingRaw === 'object' && !Array.isArray(landingRaw) ? landingRaw : undefined;
  if (landingRaw != null && !landingObj) rejected.push({ key: 'tracking', reason: 'clave', origen: 'landing' });
  let modo: TrackingMode = 'add';
  const modoCrudo = opts.landing?.mode;
  if (modoCrudo != null && modoCrudo !== '') {
    const m = typeof modoCrudo === 'string' ? modoCrudo.trim().toLowerCase() : '';
    if (m === 'add' || m === 'replace') modo = m;
    else rejected.push({ key: 'trackingMode', reason: 'modo', origen: 'landing' });
  }
  if (landingObj) {
    for (const k of Object.keys(landingObj)) {
      if (!LANDING_KEYS.includes(k)) rejected.push({ key: k, reason: 'clave', origen: 'landing' });
    }
  }

  for (const def of PROVIDERS) {
    const override =
      def.key === 'ga4' ? opts.overrides?.googleAnalyticsId
      : def.key === 'gtm' ? opts.overrides?.googleTagManagerId
      : undefined;
    const propio = leer(settings.tracking, [def.key]);
    const legado = def.legacy ? leer(settings, def.legacy) : '';
    // `null` = el YAML trae algo que no es una cadena (p. ej. un id numérico sin
    // comillas): se avisa en vez de apagar el proveedor en silencio.
    let site: Parsed = { ids: [], posiciones: [] };
    if ((propio === null && !(override ?? '').trim()) || (propio === '' && legado === null && !(override ?? '').trim())) {
      rejected.push({ key: def.key, reason: 'no-cadena' });
    } else {
      const valor = (override ?? '').trim() || propio || legado || '';
      if (valor) site = parsear(def, valor, 'site', rejected);
    }

    // Lo que trae la landing para ESTE proveedor.
    let ids = site.ids;
    let posicionesSite = site.posiciones;
    const puede = def.perLanding !== false && !isExempt(def);
    const lv = puede && landingObj ? leer(landingObj, [def.key]) : '';
    if (lv === null) {
      // Un valor que no es cadena (id numérico sin comillas). En `replace` la landing pidió
      // sustituir y no se puede cumplir: el proveedor se APAGA en esa landing (jamás hereda
      // el píxel del site: sus visitas irían a una audiencia que no es la de la campaña).
      rejected.push({ key: def.key, reason: 'no-cadena', origen: 'landing' });
      if (modo === 'replace') { ids = []; posicionesSite = []; }
    } else if (lv) {
      const landing = parsear(def, lv, 'landing', rejected);
      if (def.key === 'googleAds') adsLanding = landing;
      if (modo === 'replace') {
        ids = landing.ids; // puede quedar vacío si todos eran inválidos: apagado, ver arriba
        posicionesSite = []; // las cuentas del site ya no están: sus etiquetas no se emparejan con nada
      } else {
        const tope = def.maxIds ?? MAX_IDS_POR_DEFECTO;
        const suma = [...site.ids];
        for (const id of landing.ids) if (!suma.includes(id)) suma.push(id);
        if (suma.length > tope) {
          rejected.push({ key: def.key, reason: 'tope', max: tope, origen: 'landing' });
          suma.length = tope;
        }
        ids = suma;
      }
    }

    if (ids.length === 0) continue;
    // Una `none` SIN motivo no es exención: falla cerrado, como analytics (pide consentimiento).
    providers.push({ key: def.key, id: ids[0], ids, category: def.category === 'none' && !isExempt(def) ? 'analytics' : def.category });
    if (def.key === 'googleAds') adsSite = { ids: site.ids, posiciones: posicionesSite };
  }

  // Etiquetas de conversión: las del site con las cuentas del site, las de la landing con las
  // cuentas de la landing (misma regla de emparejar por posición). Si coinciden en una cuenta
  // gana la de la landing (la más específica).
  const etiquetaSite = leer(settings.tracking, ['googleAdsConversionLabel']);
  const delSite = emparejarEtiquetas(etiquetaSite, adsSite, 'site', rejected);
  let delLanding: AdsConversion[] = [];
  if (landingObj) {
    const lv = leer(landingObj, ['googleAdsConversionLabel']);
    if (lv !== '') delLanding = emparejarEtiquetas(lv, adsLanding, 'landing', rejected);
  }
  const ads = providers.find((p) => p.key === 'googleAds');
  const googleAdsConversions: AdsConversion[] = [];
  for (const c of [...delSite, ...delLanding]) {
    if (!ads || !ads.ids.includes(c.id)) continue;
    const i = googleAdsConversions.findIndex((x) => x.id === c.id);
    if (i === -1) googleAdsConversions.push(c);
    else if (delLanding.includes(c)) googleAdsConversions[i] = c;
  }

  return {
    providers,
    googleAdsConversionLabel: googleAdsConversions[0]?.label ?? '',
    googleAdsConversions,
    consentKeys: providers.filter((p) => p.category !== 'none').map((p) => p.key),
    showMarketing: providers.some((p) => p.category === 'marketing' || p.category === 'any'),
    rejected,
  };
}
