import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CABECERAS_MINIMAS, RUTA_HEADERS, RUTA_TS, comparables, diferencias, faltanMinimas, leerHeaders, leerTs } from './cabeceras.mjs'

describe('lectores de las listas de cabeceras', () => {
  it('leen las del repo, y las dos cuadran en nombre y valor', () => {
    const assets = leerHeaders(fs.readFileSync(RUTA_HEADERS, 'utf8'))
    const worker = leerTs(fs.readFileSync(RUTA_TS, 'utf8'))
    expect(CABECERAS_MINIMAS).toHaveLength(6)
    expect(faltanMinimas(assets)).toEqual([])
    expect(faltanMinimas(worker)).toEqual([])
    expect(comparables(assets)).toEqual(comparables(worker))
    expect(diferencias(assets, worker)).toEqual({ soloAssets: [], soloWorker: [], valorDistinto: [] })
    // Con comillas dobles en el .ts y simples dentro del valor.
    expect(worker.get('content-security-policy')).toBe("frame-ancestors 'self'")
  })

  it('la CSP completa va solo en modo informe: la real sigue siendo frame-ancestors', () => {
    const worker = leerTs(fs.readFileSync(RUTA_TS, 'utf8'))
    const ro = worker.get('content-security-policy-report-only')
    expect(ro).toBeTruthy()
    // Una línea, con las directivas que medimos; sin endpoint de informes inventado.
    expect(ro).toContain("default-src 'self'")
    expect(ro).toContain("script-src 'self' 'unsafe-inline'")
    expect(ro).not.toMatch(/report-uri|report-to/)
    // Promoverla a real es una decisión: la que se APLICA no gana directivas por accidente.
    expect(worker.get('content-security-policy')).toBe("frame-ancestors 'self'")
    expect(CABECERAS_MINIMAS).toContain('content-security-policy-report-only')
  })

  it('_headers: solo el bloque /*, no los de caché', () => {
    const m = leerHeaders('/*\n  X-A: 1\n  X-B: dos tres\n\n/_astro/*\n  Cache-Control: x\n')
    expect([...m]).toEqual([['x-a', '1'], ['x-b', 'dos tres']])
  })

  it('diferencias: nombre que falta y valor distinto, HSTS ignorado', () => {
    const assets = new Map([['x-a', '1'], ['x-b', '2'], ['strict-transport-security', 'max-age=1']])
    const worker = new Map([['x-a', '1'], ['x-b', '3'], ['x-c', '4']])
    expect(diferencias(assets, worker)).toEqual({
      soloAssets: [],
      soloWorker: ['x-c'],
      valorDistinto: [{ nombre: 'x-b', assets: '2', worker: '3' }],
    })
  })
})
