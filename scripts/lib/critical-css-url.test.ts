/** El veredicto del modo `--url` de critical-css-check (scripts/lib/critical-css-url.mjs). */
import { describe, expect, it } from 'vitest'
import { analizarHtml, veredicto } from './critical-css-url.mjs'

const HOJA = '<link rel="stylesheet" href="/_astro/a.abc.css">'
const STYLE = `<style>${'a{color:red}'.repeat(30)}</style>`
const doc = (head: string, body = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`

describe('veredicto de una respuesta', () => {
  it('crítico inline + hoja al final del body: verde', () => {
    expect(veredicto(doc(STYLE, `<p>x</p>${HOJA}`)).fallos).toEqual([])
  })
  it('hoja bloqueante en el <head>: rojo (el caso del 404 sin crítico)', () => {
    const v = veredicto(doc(`${HOJA}${STYLE}`))
    expect(v.fallos).toHaveLength(1)
    expect(v.fallos[0]).toMatch(/bloqueante/)
  })
  it('hoja bloqueante sin nada inline: dos fallos', () => {
    expect(veredicto(doc(HOJA)).fallos).toHaveLength(2)
  })
  it('hoja externa al final pero sin CSS inline suficiente: rojo', () => {
    expect(veredicto(doc('<style>a{}</style>', HOJA)).fallos).toHaveLength(1)
  })
  it('HTML sin CSS: omitida, no verde', () => {
    expect(veredicto(doc('<title>x</title>')).omitida).toBeTruthy()
  })
  it('un <link> de otro tipo (icon, canonical, preload) no cuenta como hoja', () => {
    const a = analizarHtml(doc('<link rel="icon" href="/f.svg"><link rel="preload" as="style" href="/a.css">', STYLE))
    expect(a.enHead).toEqual([])
  })
  it('lista las hojas locales una vez', () => {
    expect(analizarHtml(doc(STYLE, HOJA + HOJA)).hrefs).toEqual(['/_astro/a.abc.css'])
  })
})
