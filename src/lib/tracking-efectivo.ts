/**
 * tracking-efectivo.ts — el contenido de `/saastro-tracking.json`: la configuración de medición
 * EFECTIVA del site (qué ids están realmente activos y de dónde vienen), para que el Hub la lea
 * del site desplegado sin adivinar (ni leer solo settings.yaml, que no ve las variables de build,
 * ni rascar el HTML).
 *
 * NO resuelve nada por su cuenta: formatea el `report` que ya calcula `resolveTracking` en la
 * misma pasada que decide qué carga BaseLayout. La precedencia (variable > settings > legacy) vive
 * UNA sola vez, en tracking.ts. Función pura: sin Astro, sin reloj, sin entorno → el build es
 * determinista (misma entrada, mismos bytes).
 *
 * Qué NO lleva, a propósito: el valor de un id inválido (solo el motivo), WhatsApp, rutas, el
 * frontmatter de las landings, secretos (aquí no hay: los ids son públicos en el HTML servido).
 */
import {
  PROVIDERS,
  envVarName,
  isExempt,
  type InvalidReason,
  type ResolvedTracking,
  type TrackingSource,
} from './tracking';

export const TRACKING_JSON_SCHEMA = 1;

/** Origen tal como lo publica el fichero: `prop` (props de BaseLayout) no existe a este nivel. */
export type PublishedSource = Exclude<TrackingSource, 'prop'>;

export interface TrackingEntry {
  key: string;
  label: string;
  /** Categoría del catálogo: analytics | marketing | any (GTM, con cualquiera de las dos) | none (exento). */
  category: string;
  ids: string[];
  source: PublishedSource;
  envVar: string;
  consentRequired: boolean;
  perLanding: boolean;
  /** Solo si se descartó un valor: motivos, nunca el valor. */
  invalid?: InvalidReason[];
}

export interface TrackingJson {
  schema: typeof TRACKING_JSON_SCHEMA;
  siteUrl: string;
  providers: TrackingEntry[];
}

export function trackingJson(resolved: Pick<ResolvedTracking, 'report'>, siteUrl: string): TrackingJson {
  const providers = PROVIDERS.map((def): TrackingEntry => {
    const r = resolved.report.find((x) => x.key === def.key);
    if (!r) throw new Error(`[tracking-efectivo] resolveTracking no informó del proveedor ${def.key}`);
    // `prop` solo existe si alguien pasa props a BaseLayout; este fichero nunca las pasa.
    const source: PublishedSource = r.source === 'prop' ? 'settings' : r.source;
    return {
      key: def.key,
      label: def.label,
      category: def.category,
      ids: [...r.ids],
      source,
      envVar: envVarName(def.key),
      consentRequired: !isExempt(def),
      perLanding: def.perLanding !== false && !isExempt(def),
      ...(r.invalid.length ? { invalid: [...r.invalid] } : {}),
    };
  }).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { schema: TRACKING_JSON_SCHEMA, siteUrl, providers };
}

/** Serialización estable: 2 espacios y salto de línea final. */
export function serializar(json: TrackingJson): string {
  return JSON.stringify(json, null, 2) + '\n';
}
