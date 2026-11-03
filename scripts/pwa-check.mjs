#!/usr/bin/env node
// El web manifest es opt-in: comprueba el build (dist/client) contra `pwa.enabled` de
// settings.yaml. Regla y razón: scripts/lib/pwa-dist.mjs y src/lib/pwa.ts. Sale 1 si no cuadra.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parse } from 'yaml'
import { comprobar, enabledDeSettings } from './lib/pwa-dist.mjs'

const DIST = 'dist/client'
if (!existsSync(DIST)) {
  console.error(`✗ pwa-check: no existe ${DIST} (corre el build antes)`)
  process.exit(1)
}
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]))
const todos = walk(DIST).map((f) => relative(DIST, f))
const htmls = Object.fromEntries(todos.filter((f) => f.endsWith('.html')).map((f) => [f, readFileSync(join(DIST, f), 'utf8')]))
const files = Object.fromEntries(
  todos.filter((f) => f === 'manifest.webmanifest' || f === 'manifest.json').map((f) => [f, readFileSync(join(DIST, f), 'utf8')]),
)
const settings = parse(readFileSync('src/data/settings.yaml', 'utf8')) ?? {}
const enabled = enabledDeSettings(settings.pwa)
const problemas = comprobar({ enabled, htmls, files })
if (problemas.length) {
  console.error(`✗ pwa-check (pwa.enabled=${enabled}):\n  - ${problemas.join('\n  - ')}`)
  process.exit(1)
}
console.log(`✓ pwa-check: pwa.enabled=${enabled}, ${Object.keys(htmls).length} HTML, ${Object.keys(files).length} fichero(s) de manifest — coherente.`)
