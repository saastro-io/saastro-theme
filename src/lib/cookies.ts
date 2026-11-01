export interface CookieConsent {
  essential: true
  analytics: boolean
  /** Publicidad y medición de campañas (Meta, TikTok, LinkedIn, Google Ads…).
   *  Un consentimiento guardado ANTES de que existiera esta categoría no la
   *  trae: se lee como `false` (parseConsent), nunca como aceptada. */
  marketing: boolean
  personalization: boolean
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
    return { ...raw, marketing: raw.marketing === true }
  } catch {
    return null
  }
}

export function setConsent(prefs: ConsentPrefs): void {
  const consent: CookieConsent = {
    essential: true,
    analytics: prefs.analytics,
    marketing: prefs.marketing,
    personalization: prefs.personalization,
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

export function hasConsent(category: keyof CookieConsent): boolean {
  const consent = getConsent()
  if (!consent) return false
  return !!consent[category]
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
