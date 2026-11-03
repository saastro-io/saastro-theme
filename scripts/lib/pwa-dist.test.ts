/** La regla del build (scripts/lib/pwa-dist.mjs): apagado => nada; encendido => link + fichero coherentes. */
import { describe, expect, it } from 'vitest'
import { comprobar, enabledDeSettings } from './pwa-dist.mjs'

const LINK = '<link rel="manifest" href="/manifest.webmanifest">'
const LEGACY = '<link rel="manifest" href="/manifest.json">'
const page = (extra = '') => `<!doctype html><head><title>x</title>${extra}</head><body></body>`
const OK_JSON = JSON.stringify({ name: 'A', short_name: 'A', start_url: '/', icons: [{ src: '/i.png' }] })

describe('pwa apagada', () => {
  it('HTML sin link y sin ficheros: verde', () => {
    expect(comprobar({ enabled: false, htmls: { 'index.html': page() }, files: {} })).toEqual([])
  })
  it('un link en cualquier página: rojo (aunque sea una sola de muchas)', () => {
    const p = comprobar({ enabled: false, htmls: { 'index.html': page(), 'blog/index.html': page(LINK) }, files: {} })
    expect(p).toEqual(['blog/index.html: lleva <link rel="manifest"> con pwa.enabled apagado'])
  })
  it('el link viejo (/manifest.json) incondicional: rojo', () => {
    expect(comprobar({ enabled: false, htmls: { 'index.html': page(LEGACY) }, files: {} })).toHaveLength(1)
  })
  it('un fichero de manifest en dist: rojo', () => {
    expect(comprobar({ enabled: false, htmls: { 'index.html': page() }, files: { 'manifest.json': '{}' } })).toHaveLength(1)
    expect(comprobar({ enabled: false, htmls: { 'index.html': page() }, files: { 'manifest.webmanifest': OK_JSON } })).toHaveLength(1)
  })
  it('sin HTML no hay veredicto verde', () => {
    expect(comprobar({ enabled: false, htmls: {}, files: {} })).toHaveLength(1)
  })
})

describe('pwa encendida', () => {
  it('home con link + manifest válido: verde', () => {
    expect(comprobar({ enabled: true, htmls: { 'index.html': page(LINK) }, files: { 'manifest.webmanifest': OK_JSON } })).toEqual([])
  })
  it('sin link en la home, sin fichero, JSON roto, falta icons o manifest.json viejo: rojo', () => {
    const h = { 'index.html': page(LINK) }
    expect(comprobar({ enabled: true, htmls: { 'index.html': page() }, files: { 'manifest.webmanifest': OK_JSON } })).toHaveLength(1)
    expect(comprobar({ enabled: true, htmls: h, files: {} })).toHaveLength(1)
    expect(comprobar({ enabled: true, htmls: h, files: { 'manifest.webmanifest': '{no' } })).toHaveLength(1)
    expect(comprobar({ enabled: true, htmls: h, files: { 'manifest.webmanifest': JSON.stringify({ name: 'A', short_name: 'A', start_url: '/', icons: [] }) } })).toHaveLength(1)
    expect(comprobar({ enabled: true, htmls: { 'index.html': page(LEGACY) }, files: { 'manifest.webmanifest': OK_JSON } }).length).toBeGreaterThan(0)
  })
})

describe('enabledDeSettings', () => {
  it('solo true / "true"', () => {
    expect([true, 'true'].map((e) => enabledDeSettings({ enabled: e }))).toEqual([true, true])
    for (const v of [undefined, null, {}, { enabled: false }, { enabled: 'no' }, { enabled: 1 }]) expect(enabledDeSettings(v)).toBe(false)
  })
})
