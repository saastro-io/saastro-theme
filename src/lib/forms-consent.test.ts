import { afterEach, describe, expect, it, vi } from 'vitest'

// Sin DOM en vitest: un window/document mínimos. Lo que se prueba es el cableado
// del theme (cookie `cookie_consent` + evento `cookie-consent-updated` + casilla
// `analytics`) contra la librería REAL, no una copia.
function entorno(cookie: string) {
  const listeners = new Map<string, Array<() => void>>()
  // sonner (dependencia de la librería) inyecta su CSS al importarse.
  const nodo = { appendChild: () => {}, styleSheet: undefined, type: '' }
  const doc = {
    cookie,
    head: nodo,
    getElementsByTagName: () => [nodo],
    createElement: () => ({ ...nodo }),
    createTextNode: () => ({}),
  }
  const win = {
    addEventListener: (ev: string, fn: () => void) => listeners.set(ev, [...(listeners.get(ev) ?? []), fn]),
    removeEventListener: () => {},
  }
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', win)
  return { doc, emit: (ev: string) => (listeners.get(ev) ?? []).forEach((f) => f()) }
}

const galleta = (c: object) => `cookie_consent=${encodeURIComponent(JSON.stringify(c))}`

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('forms-consent: setConsent cableado al banner del theme', () => {
  it('sin cookie no hay consentimiento de atribución ni de enriquecimiento', async () => {
    entorno('')
    await import('./forms-consent')
    const { hasConsent } = await import('@saastro/forms')
    expect(hasConsent('attribution')).toBe(false)
    expect(hasConsent('enrichment')).toBe(false)
  })

  it('analytics:false no concede', async () => {
    entorno(galleta({ essential: true, analytics: false, marketing: true }))
    await import('./forms-consent')
    const { hasConsent } = await import('@saastro/forms')
    expect(hasConsent('attribution')).toBe(false)
  })

  it('analytics:true concede ambas', async () => {
    entorno(galleta({ essential: true, analytics: true, marketing: false }))
    await import('./forms-consent')
    const { hasConsent } = await import('@saastro/forms')
    expect(hasConsent('attribution')).toBe(true)
    expect(hasConsent('enrichment')).toBe(true)
  })

  it('cookie-consent-updated reevalúa la cookie', async () => {
    const e = entorno('')
    await import('./forms-consent')
    const { hasConsent } = await import('@saastro/forms')
    expect(hasConsent('attribution')).toBe(false)
    e.doc.cookie = galleta({ essential: true, analytics: true, marketing: false })
    e.emit('cookie-consent-updated')
    expect(hasConsent('attribution')).toBe(true)
  })
})
