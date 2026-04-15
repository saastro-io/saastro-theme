export interface CookieConsent {
  essential: true
  analytics: boolean
  personalization: boolean
  timestamp: string
}

const COOKIE_NAME = 'cookie_consent'
const MAX_AGE = 365 * 24 * 60 * 60 // 1 year in seconds

export function parseConsent(cookieString: string): CookieConsent | null {
  const match = cookieString.split('; ').find((c) => c.startsWith(`${COOKIE_NAME}=`))
  if (!match) return null
  try {
    return JSON.parse(decodeURIComponent(match.split('=').slice(1).join('=')))
  } catch {
    return null
  }
}

export function setConsent(prefs: { analytics: boolean; personalization: boolean }): void {
  const consent: CookieConsent = {
    essential: true,
    analytics: prefs.analytics,
    personalization: prefs.personalization,
    timestamp: new Date().toISOString(),
  }
  const value = encodeURIComponent(JSON.stringify(consent))
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${MAX_AGE}; SameSite=Lax; Secure`
}

export function getConsent(): CookieConsent | null {
  return parseConsent(document.cookie)
}

export function hasConsent(category: keyof CookieConsent): boolean {
  const consent = getConsent()
  if (!consent) return false
  return !!consent[category]
}
