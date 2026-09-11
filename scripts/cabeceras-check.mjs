#!/usr/bin/env node
/**
 * Las DOS listas de cabeceras tienen que decir lo mismo.
 *
 * Con Workers Static Assets hay dos y cada una cubre lo que la otra no: la
 * petición que casa con un fichero del bundle la sirve la capa de assets
 * (manda `public/_headers`) y la que no, la resuelve el Worker (manda
 * `src/lib/security-headers.ts`, aplicada desde el middleware). Si divergen,
 * media respuesta del site lleva una política y la otra media otra — que es
 * peor de diagnosticar que no tener ninguna, porque medir `/` sale verde.
 *
 * No es hipotético: hasta el 11-sep-2026 `_headers` declaraba
 * `X-XSS-Protection` y la lista del Worker no, así que el 404 servía 5 de 6.
 * Se detectó por casualidad, midiendo otra cosa.
 *
 * Este control existe para que la próxima divergencia no dependa de la
 * casualidad. Compara NOMBRES, no valores: que las dos listas cubran las
 * mismas cabeceras.
 *
 * `Strict-Transport-Security` se ignora a propósito en las dos: lo manda la
 * configuración de zona con `includeSubDomains` y declararlo aquí lo pisaría
 * a la baja (ver el comentario de cada fichero).
 */
import fs from 'node:fs'

const RUTA_HEADERS = 'public/_headers'
const RUTA_TS = 'src/lib/security-headers.ts'
const IGNORADAS = new Set(['strict-transport-security'])

const rojo = (s) => `\x1b[31m${s}\x1b[0m`
const verde = (s) => `\x1b[32m${s}\x1b[0m`

/** Nombres del bloque `/*` de `_headers` (el global; los de caché van aparte). */
function leerHeaders(texto) {
  const nombres = new Set()
  let dentro = false
  for (const linea of texto.split('\n')) {
    if (/^\S/.test(linea)) {
      dentro = linea.trim() === '/*'
      continue
    }
    if (!dentro) continue
    const m = linea.match(/^\s+([A-Za-z][A-Za-z0-9-]*):/)
    if (m) nombres.add(m[1].toLowerCase())
  }
  return nombres
}

/** Claves de `SECURITY_HEADERS` en el módulo del middleware. */
function leerTs(texto) {
  const bloque = texto.match(/SECURITY_HEADERS[^=]*=\s*\{([\s\S]*?)\n\}/)
  if (!bloque) return new Set()
  const nombres = new Set()
  for (const m of bloque[1].matchAll(/^\s*'([^']+)'\s*:/gm)) nombres.add(m[1].toLowerCase())
  return nombres
}

const assets = leerHeaders(fs.readFileSync(RUTA_HEADERS, 'utf8'))
const worker = leerTs(fs.readFileSync(RUTA_TS, 'utf8'))

// Control positivo: si un lector devuelve vacío, el roto es el lector, no el
// site — y un control que no puede fallar no es un control. Un cero sacado con
// el patrón equivocado no mide una ausencia.
for (const [nombre, set, ruta] of [['assets', assets, RUTA_HEADERS], ['worker', worker, RUTA_TS]]) {
  if (set.size === 0) {
    console.error(rojo(`✖ cabeceras-check — no he sabido leer ninguna cabecera de ${ruta}.`))
    console.error('  El fallo es del lector de este script, no del site. Arréglalo antes de creerte el resultado.')
    process.exit(2)
  }
}

const comparables = (s) => [...s].filter((n) => !IGNORADAS.has(n)).sort()
const soloAssets = comparables(assets).filter((n) => !worker.has(n))
const soloWorker = comparables(worker).filter((n) => !assets.has(n))

if (soloAssets.length === 0 && soloWorker.length === 0) {
  console.log(verde(`✓ cabeceras-check — las dos listas cuadran (${comparables(assets).length} cabeceras).`))
  process.exit(0)
}

console.error(rojo('✖ cabeceras-check — las dos listas de cabeceras NO dicen lo mismo.'))
if (soloAssets.length) {
  console.error(`  solo en ${RUTA_HEADERS}: ${soloAssets.join(', ')}`)
  console.error('    → las páginas prerenderizadas las llevan y las respuestas del Worker (SSR, 404) no.')
}
if (soloWorker.length) {
  console.error(`  solo en ${RUTA_TS}: ${soloWorker.join(', ')}`)
  console.error('    → las respuestas del Worker las llevan y las páginas prerenderizadas no.')
}
console.error('  fix: añade la que falte a la otra lista, o quítala de las dos. Y compruébalo')
console.error('       ruta por ruta: `curl -sI` sobre `/`, una ruta SSR y un 404.')
process.exit(1)
