export interface CookieConsent {
  essential: true
  analytics: boolean
  /** Publicidad y medición de campañas (Meta, TikTok, LinkedIn, Google Ads…).
   *  Un consentimiento guardado ANTES de que existiera esta categoría no la
   *  trae: se lee como `false` (parseConsent), nunca como aceptada. */
  marketing: boolean
  personalization: boolean
  /** Claves de los proveedores de tracking ENCENDIDOS cuando se consintió
   *  (tracking-providers.json). Es la VERSIÓN del consentimiento: si hoy hay un
   *  proveedor que no está aquí, el visitante no consintió ESE tratamiento y se
   *  le vuelve a preguntar (ver `consentCovers`). Ausente = cookie anterior a
   *  este campo. */
  providers?: string[]
  timestamp: string
}

export interface ConsentPrefs {
  analytics: boolean
  marketing: boolean
  personalization: boolean
}

const COOKIE_NAME = 'cookie_consent'
const MAX_AGE = 365 * 24 * 60 * 60 // 1 year in seconds

export function parseConsent(cookieString: string): CookieConsent | null {
  const match = cookieString.split('; ').find((c) => c.startsWith(`${COOKIE_NAME}=`))
  if (!match) return null
  try {
    const raw = JSON.parse(decodeURIComponent(match.split('=').slice(1).join('=')))
    if (!raw || typeof raw !== 'object') return null
    // Cookies antiguas no traen `marketing`: «no» explícito, nunca undefined.
    // `providers` solo si es una lista; cualquier otra cosa = ausente (nunca se
    // inventa una lista vacía: «vacía» SÍ significa «no había ninguno»). Mismo
    // criterio que el inline de Analytics.astro (Array.isArray + indexOf).
    const providers = Array.isArray(raw.providers) ? (raw.providers as string[]) : undefined
    const { providers: _descartado, ...resto } = raw
    return { ...resto, marketing: raw.marketing === true, ...(providers ? { providers } : {}) }
  } catch {
    return null
  }
}

/** ¿Este consentimiento cubre TODOS los proveedores encendidos ahora?
 *
 *  Fuente ÚNICA de la regla. Analytics.astro la REPLICA en su lector inline (no
 *  puede importar), y Analytics.test.ts ejecuta el inline real contra esta
 *  función: si divergen, falla.
 *
 *  - sin consentimiento → no.
 *  - ningún proveedor encendido → sí (no hay nada que pedir).
 *  - consentimiento SIN `providers` (anterior a esta versión) con algún proveedor
 *    encendido → NO. No se puede saber si ese visitante vio los proveedores de
 *    hoy, y la opción segura es volver a preguntar. Con ninguno encendido, vale.
 *  - con `providers` → sí solo si todo proveedor encendido ahora está en la lista.
 *    Un proveedor que se APAGA no invalida nada (la lista guardada es superconjunto). */
export function consentCovers(
  consent: { providers?: unknown } | null | undefined,
  currentKeys: readonly string[],
): boolean {
  if (!consent) return false
  if (currentKeys.length === 0) return true
  const guardados = consent.providers
  if (!Array.isArray(guardados)) return false
  return currentKeys.every((k) => guardados.includes(k))
}

/** Lo que el banner hace al montarse. Pura para poder probarla sin React.
 *  - `visible`: pregunta si no hay consentimiento válido.
 *  - `mirrorAnalytics`: valor con el que alinear `gen-consent` (solo concede, ver
 *    gen-consent.ts) cuando el consentimiento es válido; `'retirar'` si existe
 *    pero NO es válido (no puede seguir concediendo); `null` si no hay cookie.
 *  - `prefill`: la elección previa, para precargarla en «Personalizar». */
export function bannerAlMontar(
  consent: CookieConsent | null,
  currentKeys: readonly string[],
): { visible: boolean; mirrorAnalytics: boolean | 'retirar' | null; prefill: ConsentPrefs | null } {
  if (!consent) return { visible: true, mirrorAnalytics: null, prefill: null }
  const prefill = { analytics: consent.analytics, marketing: consent.marketing, personalization: consent.personalization }
  if (consentCovers(consent, currentKeys)) return { visible: false, mirrorAnalytics: consent.analytics, prefill }
  return { visible: true, mirrorAnalytics: 'retirar', prefill }
}

export function setConsent(prefs: ConsentPrefs, providers: readonly string[]): void {
  const consent: CookieConsent = {
    essential: true,
    analytics: prefs.analytics,
    marketing: prefs.marketing,
    personalization: prefs.personalization,
    providers: [...new Set(providers)].sort(),
    timestamp: new Date().toISOString(),
  }
  const value = encodeURIComponent(JSON.stringify(consent))
  // `Secure` solo sobre https: en http (dev en un host que no es localhost,
  // p. ej. saastro.test) el navegador DESCARTA una cookie Secure en silencio y
  // la elección no sobrevive a la recarga — el banner vuelve a salir.
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${MAX_AGE}; SameSite=Lax${secure}`
}

export function getConsent(): CookieConsent | null {
  return parseConsent(document.cookie)
}

export function hasConsent(category: 'analytics' | 'marketing' | 'personalization', currentKeys: readonly string[]): boolean {
  const consent = getConsent()
  if (!consentCovers(consent, currentKeys)) return false
  return !!consent![category]
}

/** ¿Alguna categoría pasa de concedida a retirada? Es lo que obliga a recargar
 *  si hay un tracker vivo. Pura y exportada para poder probarla. */
export function consentRevoked(
  previous: Pick<ConsentPrefs, 'analytics' | 'marketing'> | null,
  next: Pick<ConsentPrefs, 'analytics' | 'marketing'>,
): boolean {
  if (!previous) return false
  return (previous.analytics && !next.analytics) || (previous.marketing && !next.marketing)
}

/** Lo que de verdad se guarda al pulsar un botón del banner. Sin la categoría a
 *  la vista no hay consentimiento que dar: nunca se guarda un `marketing: true`
 *  que el visitante no pudo ver ni decidir. */
export function resolvePrefs(
  input: Omit<ConsentPrefs, 'marketing'> & { marketing?: boolean },
  showMarketing: boolean,
): ConsentPrefs {
  return { ...input, marketing: showMarketing && input.marketing === true }
}

/** Qué categorías pasan de concedidas a retiradas (para borrar sus cookies). */
export function revokedCategories(
  previous: Pick<ConsentPrefs, 'analytics' | 'marketing'> | null,
  next: Pick<ConsentPrefs, 'analytics' | 'marketing'>,
): Array<'analytics' | 'marketing'> {
  if (!previous) return []
  const out: Array<'analytics' | 'marketing'> = []
  if (previous.analytics && !next.analytics) out.push('analytics')
  if (previous.marketing && !next.marketing) out.push('marketing')
  return out
}
