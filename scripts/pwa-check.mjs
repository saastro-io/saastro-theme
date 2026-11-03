#!/usr/bin/env node
// El web manifest es opt-in: comprueba el build (dist/client) contra `pwa.enabled` de
// settings.yaml. Regla y razón: scripts/lib/pwa-dist.mjs y src/lib/pwa.ts. Sale 1 si no cuadra.
// La rama ENCENDIDA se prueba aparte, con un build de verdad: scripts/pwa-build-check.mjs.
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { comprobar, enabledDeSettings, leerDist } from './lib/pwa-dist.mjs'

const dist = leerDist('dist/client')
if (!dist) {
  console.error('✗ pwa-check: no existe dist/client (corre el build antes)')
  process.exit(1)
}
const settings = parse(readFileSync('src/data/settings.yaml', 'utf8')) ?? {}
const enabled = enabledDeSettings(settings.pwa)
const problemas = comprobar({ enabled, ...dist })
if (problemas.length) {
  console.error(`✗ pwa-check (pwa.enabled=${enabled}):\n  - ${problemas.join('\n  - ')}`)
  process.exit(1)
}
console.log(`✓ pwa-check: pwa.enabled=${enabled}, ${Object.keys(dist.htmls).length} HTML, ${Object.keys(dist.files).length} fichero(s) de manifest — coherente.`)
