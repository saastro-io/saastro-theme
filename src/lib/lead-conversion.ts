/**
 * Qué pasa cuando un formulario de landing se envía bien: avisar a los píxeles
 * (con UN event_id) y llevar al visitante a la página de gracias.
 *
 * El `event_id` NO lo inventa el theme si puede evitarlo: la plantilla de
 * formulario del Hub lleva un campo oculto `_event_id` con el resolver
 * `submissionId` de @saastro/forms (un UUID por carga del formulario) y viaja en
 * el payload al Hub. `onSuccess` recibe esos mismos valores, así que el píxel del
 * navegador y —cuando exista— la API de conversiones de servidor comparten id y
 * el proveedor deduplica. Si el formulario no trae el campo, se genera uno aquí:
 * el navegador sigue funcionando, solo que no habrá nada con lo que deduplicar.
 */

export interface TrackWindow {
  saastroTrack?: (evento: string, datos?: Record<string, unknown>) => string[]
  setTimeout: (fn: () => void, ms: number) => unknown
  location: { assign: (href: string) => void }
  crypto?: { randomUUID?: () => string }
}

/** Un UUID no vacío del campo `_event_id`, o uno nuevo. */
export function leadEventId(values: Record<string, unknown>, w?: Pick<TrackWindow, 'crypto'>): string {
  const v = values?._event_id
  if (typeof v === 'string' && v.trim() !== '' && v.length <= 100) return v.trim()
  const c = w?.crypto ?? (typeof crypto !== 'undefined' ? crypto : undefined)
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `lead-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

/** Solo rutas internas: `/gracias` sí; `//evil.com`, `https://…` y `javascript:` no. */
export function isInternalPath(href: unknown): href is string {
  return typeof href === 'string' && /^\/(?!\/|\\)/.test(href)
}

/** Espera antes de navegar para que los píxeles terminen de enviar (SIN VERIFICAR el valor). */
export const REDIRECT_DELAY_MS = 350

/**
 * Emite `generate_lead` a los proveedores ya cargados y, si hay una página de
 * gracias válida, navega a ella. Nunca lanza: un píxel roto no puede impedir que
 * el visitante vea que su envío funcionó.
 */
export function onLeadSuccess(
  values: Record<string, unknown>,
  opts: { thanksHref?: string },
  w: TrackWindow,
): { eventId: string; sent: string[] } {
  const eventId = leadEventId(values, w)
  let sent: string[] = []
  try {
    sent = w.saastroTrack?.('generate_lead', { event_id: eventId }) ?? []
  } catch {
    /* un tercero roto no tumba el envío */
  }
  if (isInternalPath(opts.thanksHref)) {
    const href = opts.thanksHref
    w.setTimeout(() => w.location.assign(href), REDIRECT_DELAY_MS)
  }
  return { eventId, sent }
}
