#!/usr/bin/env node
/**
 * ¿Lleva la respuesta del WORKER las cabeceras de seguridad? Sobre el build.
 *
 * `cabeceras-check.mjs` compara las dos listas en el fuente, pero no ve si el
 * middleware las APLICA. Medido el 30-sep-2026: con `onRequest =
 * sequence(site)` (sin `securityHeaders`) el 404 y `/lp/*` bajan de 5 a 0
 * cabeceras y aun así `cabeceras-check` y los tests seguían en verde. Este
 * script es el que se pone rojo en ese caso.
 *
 * Arranca el Worker construido (`dist/server/wrangler.json`) en local con
 * `unstable_startWorker` —el mismo workerd de `wrangler dev`, sin cuenta de
 * Cloudflare— y pide dos rutas que SOLO puede resolver el Worker:
 *
 *   - un 404 (ningún fichero del bundle casa)
 *   - una landing `/lp/<inexistente>` (SSR, redirige a home)
 *
 * y exige en cada una TODAS las cabeceras del bloque `/*` de `public/_headers`,
 * con el mismo valor. Antes de arrancar comprueba que `_headers` y
 * `src/lib/security-headers.ts` declaran el suelo de cinco y dicen lo mismo
 * (nombre y valor): el mismo check cubre la paridad y que el middleware las
 * aplica.
 *
 * Límite conocido: la plantilla no tiene una ruta SSR que responda 200 (la
 * landing demo es borrador y el contador `/mx/*` va apagado), así que un
 * middleware que solo vistiera los 404 y las redirecciones no se cazaría aquí.
 *
 * NO se mide `/` a propósito: es prerenderizada, la sirve la capa de assets sin
 * invocar al Worker y lleva las cabeceras de `_headers` aunque el middleware no
 * ponga ninguna. Medirla daría verde con el middleware roto — la misma trampa
 * que documenta `public/_headers`.
 */
import fs from 'node:fs'
import { RUTA_HEADERS, RUTA_TS, comparables, diferencias, faltanMinimas, leerHeaders, leerTs } from './lib/cabeceras.mjs'

const CONFIG = 'dist/server/wrangler.json'

const rojo = (s) => `\x1b[31m${s}\x1b[0m`
const verde = (s) => `\x1b[32m${s}\x1b[0m`

// Rutas del Worker, con el estado que prueba que la respuesta es suya.
const RUTAS = [
  { ruta: '/__cabeceras-check-404', estado: (s) => s === 404, que: '404' },
  { ruta: '/lp/__cabeceras-check', estado: (s) => s >= 300 && s < 400, que: 'landing SSR (redirige)' },
]

if (!fs.existsSync(CONFIG)) {
  console.error(rojo(`✖ cabeceras-worker-check — no existe ${CONFIG}. Corre antes \`astro build\`.`))
  process.exit(2)
}

const esperadas = leerHeaders(fs.readFileSync(RUTA_HEADERS, 'utf8'))
const nombres = comparables(esperadas)
// Control positivo: sin lista esperada no hay nada que pueda fallar.
if (nombres.length === 0) {
  console.error(rojo(`✖ cabeceras-worker-check — no he sabido leer ninguna cabecera de ${RUTA_HEADERS}.`))
  console.error('  El fallo es del lector, no del site. Arréglalo antes de creerte el resultado.')
  process.exit(2)
}

// Antes de arrancar nada, las dos listas: el suelo de cinco en cada una, y que
// digan lo mismo (nombre y valor). Así este check comprueba él solo que la
// lista del middleware coincide con la de `_headers`, además de que se aplica.
const delWorker = leerTs(fs.readFileSync(RUTA_TS, 'utf8'))
const previos = []
for (const [ruta, mapa] of [[RUTA_HEADERS, esperadas], [RUTA_TS, delWorker]]) {
  const faltan = faltanMinimas(mapa)
  if (faltan.length) previos.push(`${ruta} no declara: ${faltan.join(', ')} (suelo en scripts/lib/cabeceras.mjs)`)
}
const d = diferencias(esperadas, delWorker)
if (d.soloAssets.length) previos.push(`solo en ${RUTA_HEADERS}: ${d.soloAssets.join(', ')}`)
if (d.soloWorker.length) previos.push(`solo en ${RUTA_TS}: ${d.soloWorker.join(', ')}`)
for (const v of d.valorDistinto) previos.push(`${v.nombre}: «${v.assets}» en ${RUTA_HEADERS}, «${v.worker}» en ${RUTA_TS}`)
if (previos.length) {
  console.error(rojo('✖ cabeceras-worker-check — las listas no están bien antes de medir el Worker.'))
  for (const p of previos) console.error(`  ${p}`)
  process.exit(1)
}

// Si workerd no arranca o no responde, rojo en 90 s y no el job colgado hasta
// el límite de Actions.
setTimeout(() => {
  console.error(rojo('✖ cabeceras-worker-check — el Worker no arrancó o no respondió en 90 s.'))
  process.exit(1)
}, 90_000).unref()

process.env.WRANGLER_SEND_METRICS ??= 'false'
const { unstable_startWorker } = await import('wrangler')

const fallos = []
let worker
try {
  worker = await unstable_startWorker({
    config: CONFIG,
    dev: { server: { port: 0 }, inspector: false, logLevel: 'error' },
  })
  for (const { ruta, estado, que } of RUTAS) {
    const r = await worker.fetch(`http://localhost${ruta}`, { redirect: 'manual' })
    await r.arrayBuffer()
    if (!estado(r.status)) {
      fallos.push(`${ruta} (${que}): estado ${r.status} inesperado — la ruta ya no mide lo que este check cree.`)
      continue
    }
    const faltan = []
    for (const n of nombres) {
      const v = r.headers.get(n)
      if (v === null) faltan.push(`${n}: falta`)
      else if (v !== esperadas.get(n)) faltan.push(`${n}: «${v}» ≠ «${esperadas.get(n)}» de ${RUTA_HEADERS}`)
    }
    if (faltan.length) fallos.push(`${ruta} (${que}, ${r.status}): ${nombres.length - faltan.length}/${nombres.length}\n      ${faltan.join('\n      ')}`)
    else console.log(`  ${ruta} (${que}, ${r.status}): ${nombres.length}/${nombres.length}`)
  }
} finally {
  await worker?.dispose()
}

if (fallos.length === 0) {
  console.log(verde(`✓ cabeceras-worker-check — el Worker sirve las ${nombres.length} cabeceras de ${RUTA_HEADERS}, con su valor.`))
  process.exit(0)
}

console.error(rojo('✖ cabeceras-worker-check — respuestas del Worker SIN las cabeceras de seguridad.'))
for (const f of fallos) console.error(`  ${f}`)
console.error('  fix: `securityHeaders` tiene que estar en el `sequence()` de src/middleware.ts,')
console.error('       y SECURITY_HEADERS (src/lib/security-headers.ts) igual que el bloque `/*` de _headers.')
process.exit(1)
