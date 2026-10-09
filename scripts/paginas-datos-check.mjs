#!/usr/bin/env node
/**
 * «Páginas como datos» (prototipo) medido sobre el WORKER CONSTRUIDO.
 *
 * Los tests de vitest prueban la lógica pura (firma, documento, fuente,
 * handlers, manifiesto), pero no que la ruta `.astro` la cablee bien ni que
 * los bloques pinten: el compilador de Astro con el adaptador de Cloudflare no
 * arranca dentro de vitest. Esto arranca `dist/server/wrangler.json` con
 * `unstable_startWorker` (el workerd de `wrangler dev`, sin cuenta) dos veces:
 *
 *   1. SIN secreto, como cualquier descendiente: `/p/demo` y `/es/p/demo`
 *      pintan la fixture (cinco bloques con su marcador, cabeceras de rev,
 *      Server-Timing y tag de caché) y `/__render`, `/__purge` y `?__pv`
 *      responden 404.
 *   2. CON secreto, `PAGES_HUB_ORIGIN` y `TEMA_BY_HOST`: `/__render` firmado
 *      pinta un bloque suelto, la vista previa abre `frame-ancestors` al Hub e
 *      inyecta el puente, y el host del tema b pinta `data-tema="b"` y el hero b.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'

const CONFIG = 'dist/server/wrangler.json'
const rojo = (s) => `\x1b[31m${s}\x1b[0m`
const verde = (s) => `\x1b[32m${s}\x1b[0m`

if (!fs.existsSync(CONFIG)) {
  console.error(rojo(`✖ paginas-datos-check — no existe ${CONFIG}. Corre antes \`astro build\`.`))
  process.exit(2)
}
setTimeout(() => {
  console.error(rojo('✖ paginas-datos-check — el Worker no arrancó o no respondió en 120 s.'))
  process.exit(1)
}, 120_000).unref()

process.env.WRANGLER_SEND_METRICS ??= 'false'
const { unstable_startWorker } = await import('wrangler')

const fallos = []
const ok = (cond, msg) => {
  if (cond) console.log(`  ✓ ${msg}`)
  else fallos.push(msg)
}
const BLOQUES_FIXTURE = ['intro', 'ventajas', 'dudas', 'cierre', 'form']

async function conWorker(bindings, fn) {
  const worker = await unstable_startWorker({
    config: CONFIG,
    bindings,
    dev: { server: { port: 0 }, inspector: false, logLevel: 'error' },
  })
  try {
    await fn((path, init = {}) => worker.fetch(`http://${init.host ?? 'localhost'}${path}`, { redirect: 'manual', ...init }))
  } finally {
    await worker.dispose()
  }
}

// ── 1. Sin secreto ───────────────────────────────────────────────────────────
console.log('Sin PAGES_RENDER_SECRET:')
await conWorker({}, async (get) => {
  for (const [path, locale] of [['/p/demo', 'en'], ['/es/p/demo', 'es']]) {
    const r = await get(path)
    const html = await r.text()
    ok(r.status === 200, `${path} → 200 (fue ${r.status})`)
    const faltan = BLOQUES_FIXTURE.filter((id) => !html.includes(`data-saastro="sec:${id}"`))
    ok(faltan.length === 0, `${path} pinta los cinco bloques de la fixture${faltan.length ? ` (faltan: ${faltan.join(', ')})` : ''}`)
    ok(/data-saastro-field="items\.0\.q"/.test(html), `${path} lleva marcadores de campo (items.0.q)`)
    ok(html.includes('data-tema="a"'), `${path} con tema a por defecto`)
    ok(r.headers.get('x-saastro-page-rev') === '1', `${path} x-saastro-page-rev: 1`)
    const st = r.headers.get('server-timing') ?? ''
    ok(/doc;dur=/.test(st) && /render;dur=/.test(st) && /skipped;desc="0"/.test(st), `${path} Server-Timing doc + render + skipped (${st})`)
    ok((r.headers.get('cache-tag') ?? '').split(',').includes(`pg:demo:${locale}:demo`), `${path} Cache-Tag pg:demo:${locale}:demo`)
    ok(r.headers.get('x-frame-options') === 'SAMEORIGIN', `${path} conserva las cabeceras de seguridad`)
  }
  const nope = await get('/p/no-existe')
  await nope.arrayBuffer()
  ok(nope.status >= 300 && nope.status < 400 && nope.headers.get('location') === '/', `/p/no-existe → redirect a home (${nope.status})`)

  const json = { 'content-type': 'application/json' }
  for (const path of ['/__render', '/__purge']) {
    const r = await get(path, { method: 'POST', body: '{}', headers: json })
    await r.arrayBuffer()
    ok(r.status === 404, `POST ${path} → 404 sin secreto (fue ${r.status})`)
  }
  const pv = await get('/p/demo?__pv=1.ab')
  await pv.arrayBuffer()
  ok(pv.status === 404, `/p/demo?__pv → 404 sin secreto (fue ${pv.status})`)

  const m = await get('/__blocks.json')
  const manifest = m.status === 200 ? await m.json() : []
  ok(Array.isArray(manifest) && manifest.length === 6 && manifest.every((e) => e.jsonSchema?.type === 'object'), '/__blocks.json: 6 entradas (5 tipos) con jsonSchema')
})

// ── 2. Con secreto ───────────────────────────────────────────────────────────
console.log('Con PAGES_RENDER_SECRET:')
const S = 'paginas-datos-check'
const HUB = 'https://hub.example.test'
const hmac = (m) => crypto.createHmac('sha256', S).update(m).digest('hex')
const sig = (body) => {
  const t = Math.floor(Date.now() / 1000)
  return `t=${t},v1=${hmac(`${t}.${body}`)}`
}
await conWorker(
  {
    PAGES_RENDER_SECRET: { type: 'plain_text', value: S },
    PAGES_HUB_ORIGIN: { type: 'plain_text', value: HUB },
    TEMA_BY_HOST: { type: 'plain_text', value: '{"tema-b.test":"b"}' },
  },
  async (get) => {
    const body = JSON.stringify({ v: 1, siteId: 'demo', locale: 'es', tema: 'b', block: { id: 'h1', type: 'hero', props: { title: ['Hola'], subtitle: 'x', stats: [{ value: '1', label: 'uno' }] } } })
    const r = await get('/__render', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-saastro-sig': sig(body) } })
    const html = await r.text()
    ok(r.status === 200 && html.trimStart().startsWith('<section data-saastro="sec:h1"'), `/__render firmado → solo el bloque (${r.status})`)
    ok(!/<html|<head/i.test(html), '/__render es parcial (sin <html>/<head>)')
    ok(html.includes('bg-primary/5'), '/__render con tema b pinta el hero b')
    ok(/render;dur=/.test(r.headers.get('server-timing') ?? ''), '/__render Server-Timing render;dur')

    const bad = await get('/__render', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-saastro-sig': sig(body + ' ') } })
    await bad.arrayBuffer()
    ok(bad.status === 401, `/__render firma mala → 401 (fue ${bad.status})`)

    const exp = Math.floor(Date.now() / 1000) + 600
    const pv = await get(`/es/p/demo?__pv=${exp}.${hmac(`demo:es:demo:${exp}`)}`)
    const pvHtml = await pv.text()
    ok(pv.status === 200, `vista previa firmada → 200 (fue ${pv.status})`)
    ok(pv.headers.get('content-security-policy') === `frame-ancestors 'self' ${HUB}`, `vista previa: frame-ancestors abre ${HUB}`)
    ok(pv.headers.get('cache-control') === 'no-store', 'vista previa: Cache-Control no-store')
    ok(pvHtml.includes('installPreviewBridge') && pvHtml.includes(JSON.stringify(HUB)), 'vista previa: puente postMessage inyectado')

    const pub = await get('/p/demo')
    ok(!(await pub.text()).includes('installPreviewBridge'), 'la página pública no lleva el puente')

    const b = await get('/p/demo', { host: 'tema-b.test' })
    const bHtml = await b.text()
    ok(bHtml.includes('data-tema="b"') && bHtml.includes('bg-primary/5'), 'host del tema b → data-tema="b" y hero b')
  },
)

if (fallos.length === 0) {
  console.log(verde('✓ paginas-datos-check — /p/*, /__render, /__purge, ?__pv y /__blocks.json se comportan como el contrato.'))
  process.exit(0)
}
console.error(rojo('✖ paginas-datos-check'))
for (const f of fallos) console.error(`  ${f}`)
process.exit(1)
