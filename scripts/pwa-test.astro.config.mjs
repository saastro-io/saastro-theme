// Config SOLO de prueba (la usa scripts/pwa-build-check.mjs): la de siempre, pero con el
// bloque `pwa` de settings.yaml sustituido en memoria por uno ENCENDIDO y salida a otro
// directorio. No toca settings.yaml ni dist/. Sirve para que la rama `pwa.enabled: true`
// tenga cobertura de build real en CI (la plantilla siempre sale apagada).
import { mergeConfig } from 'astro/config'
import { parse, stringify } from 'yaml'
import base from '../astro.config.mjs'

import { PWA_PRUEBA } from './lib/pwa-prueba.mjs'

/** @type {import('vite').Plugin} */
const settingsConPwa = {
  name: 'pwa-prueba-settings',
  enforce: 'pre',
  async load(id) {
    if (!/\/src\/data\/settings\.yaml\?raw$/.test(id)) return null
    const { readFileSync } = await import('node:fs')
    const doc = parse(readFileSync(id.replace(/\?raw$/, ''), 'utf8')) ?? {}
    doc.pwa = PWA_PRUEBA
    return `export default ${JSON.stringify(stringify(doc))}`
  },
}

export default mergeConfig(base, {
  outDir: process.env.PWA_TEST_OUT || './dist-pwa-test',
  vite: { plugins: [settingsConPwa] },
})
