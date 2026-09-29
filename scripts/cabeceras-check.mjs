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
 * Compara NOMBRES y VALORES, sobre el fuente. Que el middleware de verdad
 * aplique la lista a las respuestas del Worker no se ve aquí: lo mide
 * `cabeceras-worker-check.mjs` sobre el build, al final de `studio:check`.
 */
import fs from 'node:fs'
import { RUTA_HEADERS, RUTA_TS, comparables, diferencias, faltanMinimas, leerHeaders, leerTs } from './lib/cabeceras.mjs'

const rojo = (s) => `\x1b[31m${s}\x1b[0m`
const verde = (s) => `\x1b[32m${s}\x1b[0m`

const assets = leerHeaders(fs.readFileSync(RUTA_HEADERS, 'utf8'))
const worker = leerTs(fs.readFileSync(RUTA_TS, 'utf8'))

// Control positivo: si un lector devuelve vacío, el roto es el lector, no el
// site — y un control que no puede fallar no es un control. Un cero sacado con
// el patrón equivocado no mide una ausencia.
for (const [lado, mapa, ruta] of [['assets', assets, RUTA_HEADERS], ['Worker', worker, RUTA_TS]]) {
  if (mapa.size === 0) {
    console.error(rojo(`✖ cabeceras-check — no he sabido leer ninguna cabecera de la lista de ${lado} (${ruta}).`))
    console.error('  El fallo es del lector de este script, no del site. Arréglalo antes de creerte el resultado.')
    process.exit(2)
  }
}

// El suelo: quitar una cabecera de las DOS listas las deja cuadrando y el
// site pierde una protección sin que nada salte.
let bajoSuelo = false
for (const [ruta, mapa] of [[RUTA_HEADERS, assets], [RUTA_TS, worker]]) {
  const faltan = faltanMinimas(mapa)
  if (faltan.length) {
    console.error(rojo(`✖ cabeceras-check — ${ruta} no declara: ${faltan.join(', ')}.`))
    bajoSuelo = true
  }
}
if (bajoSuelo) {
  console.error('  El suelo está en scripts/lib/cabeceras.mjs (CABECERAS_MINIMAS). Bajarlo es una decisión, no una edición.')
  process.exit(1)
}

const { soloAssets, soloWorker, valorDistinto } = diferencias(assets, worker)

if (soloAssets.length === 0 && soloWorker.length === 0 && valorDistinto.length === 0) {
  console.log(verde(`✓ cabeceras-check — las dos listas cuadran (${comparables(assets).length} cabeceras, nombre y valor).`))
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
for (const d of valorDistinto) {
  console.error(`  ${d.nombre} con valor distinto:`)
  console.error(`    ${RUTA_HEADERS}: ${d.assets}`)
  console.error(`    ${RUTA_TS}: ${d.worker}`)
}
console.error('  fix: iguala las dos listas (o quita la cabecera de las dos). Y compruébalo')
console.error('       ruta por ruta: `curl -sI` sobre `/`, una ruta SSR y un 404.')
process.exit(1)
