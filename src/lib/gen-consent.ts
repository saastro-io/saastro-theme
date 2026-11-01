/**
 * El beacon de Gen en modo `consent="required"` lee `localStorage['gen-consent']`,
 * no la cookie del banner. Esto alinea ese valor con la categoría `analytics`.
 *
 * - `alMontar: true`  → solo CONCEDE (si ya hay consentimiento guardado). Nunca
 *   borra: un CMP del site pudo haber puesto 'granted' por su cuenta y no se
 *   pisa en cada carga.
 * - `alMontar: false` → es una decisión del visitante (`save`): concede o retira.
 * Emite `gen:consent-granted` SOLO si el valor cambia: el beacon ya arranca solo
 * cuando era 'granted' al cargar, y emitirlo en cada montaje contaría la visita
 * dos veces.
 */
export function mirrorGenConsent(analytics: boolean, opts: { alMontar?: boolean } = {}): void {
  try {
    if (analytics) {
      if (localStorage.getItem('gen-consent') === 'granted') return
      localStorage.setItem('gen-consent', 'granted')
      window.dispatchEvent(new Event('gen:consent-granted'))
    } else if (!opts.alMontar) {
      localStorage.removeItem('gen-consent')
    }
  } catch {
    /* storage bloqueado: el beacon simplemente no arranca */
  }
}
