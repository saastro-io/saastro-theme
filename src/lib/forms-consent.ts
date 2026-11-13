/**
 * Puerta de consentimiento de @saastro/forms (>= 0.28). Sin `setConsent(...)` la
 * librería NO guarda first-touch (landingPage / firstReferrer solo en memoria),
 * ni lee cookies/storage ni llama a `ip`.
 *
 * Contrato REAL del banner del theme (CookieBanner.tsx / cookies.ts):
 *  - cookie `cookie_consent` (JSON con `analytics`, `marketing`, …),
 *  - evento `cookie-consent-updated` en `window` al guardar.
 * La atribución y el enriquecimiento cuelgan de `analytics`.
 *
 * Todos los formularios (ContactSheet, RequestSiteForm, LandingForm) importan este
 * módulo: se evalúa UNA vez por página, antes de montar ninguno. Todas las
 * páginas llevan el banner (SiteLayout); `gen.consent: none` solo afecta al beacon.
 */
import { setConsent } from '@saastro/forms'
import { fromCookie } from '@saastro/forms/consent'

if (typeof window !== 'undefined') {
  setConsent(
    fromCookie({
      name: 'cookie_consent',
      event: 'cookie-consent-updated',
      map: { attribution: 'analytics', enrichment: 'analytics' },
    }),
  )
}
