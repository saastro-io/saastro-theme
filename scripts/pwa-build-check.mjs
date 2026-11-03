#!/usr/bin/env node
// Cobertura de build de la rama `pwa.enabled: true`. La plantilla siempre sale apagada, así que
// sin esto esa rama (link + JSON con los datos del site) no la ejercitaba nada en CI.
// Construye con scripts/pwa-test.astro.config.mjs (el yaml se sustituye EN MEMORIA, settings.yaml
// y dist/ no se tocan) a un directorio temporal, y exige: link en todas las páginas, y un JSON con
// los datos de prueba. Lo que NO mide (content-type del Worker) está en docs/pwa.md. Sale 1 si no cuadra.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { comprobar, leerDist } from './lib/pwa-dist.mjs'
import { PWA_PRUEBA } from './lib/pwa-prueba.mjs'

const out = mkdtempSync(join(tmpdir(), 'pwa-build-'))
let problemas = []
try {
  const r = spawnSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--config', 'scripts/pwa-test.astro.config.mjs'], {
    env: { ...process.env, PWA_TEST_OUT: out, SITE_URL: process.env.SITE_URL || 'https://pwa-prueba.example' },
    encoding: 'utf8',
  })
  if (r.status !== 0) problemas = [`el build de prueba falló (${r.status}):\n${(r.stdout + r.stderr).split('\n').slice(-15).join('\n')}`]
  else {
    const dist = leerDist(join(out, 'client'))
    problemas = comprobar({ enabled: true, ...dist })
    const m = dist.files['manifest.webmanifest']
    if (m) {
      const j = JSON.parse(m)
      const esperado = { name: PWA_PRUEBA.name, short_name: PWA_PRUEBA.shortName, theme_color: PWA_PRUEBA.themeColor, background_color: PWA_PRUEBA.backgroundColor }
      for (const [k, v] of Object.entries(esperado)) if (j[k] !== v) problemas.push(`manifest.webmanifest: ${k} = ${JSON.stringify(j[k])}, esperado ${JSON.stringify(v)}`)
    }
    // Con la PWA encendida TODAS las páginas de BaseLayout llevan el link (no solo la home).
    const sin = Object.keys(dist.htmls).filter((h) => !/rel="manifest"/.test(dist.htmls[h]))
    for (const h of sin) problemas.push(`${h}: sin link al manifest con pwa.enabled=true`)
    if (!problemas.length) console.log(`✓ pwa-build-check: build con pwa.enabled=true — ${Object.keys(dist.htmls).length}/${Object.keys(dist.htmls).length} HTML con link, manifest.webmanifest con los datos del site.`)
  }
} finally {
  rmSync(out, { recursive: true, force: true })
}
if (problemas.length) {
  console.error(`✗ pwa-build-check:\n  - ${problemas.join('\n  - ')}`)
  process.exit(1)
}
