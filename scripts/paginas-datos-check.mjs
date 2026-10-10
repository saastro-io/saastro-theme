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
 *   2. CON secreto pero SIN `PAGES_SITE_ID`: las rutas firmadas siguen en 404.
 *   3. CON secreto, `PAGES_SITE_ID`, `PAGES_HUB_ORIGIN` y `TEMA_BY_HOST`:
 *      `/__render` firmado (Hub #655: `<t>.<siteId>.<METODO>.<ruta>.<cuerpo>`)
 *      pinta un bloque suelto; el formato viejo, otro site, otra ruta u otro
 *      método dan 401 y un cuerpo de otro site 400; la vista previa abre
 *      `frame-ancestors` al Hub e inyecta el puente. Tema por host con los
 *      hosts reales: `prototipo-b.enlolab.com` pinta `data-tema="b"` y
 *      `prototipo.enlolab.com` `"a"`, el HTML difiere y `Cache-Tag` lleva el
 *      host; `/__render` con tema b trae `data-tema="b"` en la raíz; y
 *      `Server-Timing` sale con firma, doc, render y total en ms.
 *      Render DIRECTO del navegador: `x-saastro-pv` + `Origin` del Hub → 200
 *      con CORS exacto; otro Origin, token caducado o de otro locale → sin
 *      render; preflight `OPTIONS` 204 con las cabeceras exactas; 413 por tope.
 *   4. `TEMA_BY_HOST` como var JSON (OBJETO, no string): la causa medida en
 *      producción el 10-oct — el host b salía con el tema a.
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
/** ¿Lleva `Server-Timing` cada fase con un `dur` numérico? */
const fases = (st, nombres) => nombres.every((n) => new RegExp(`(^|, )${n};dur=\\d+(\\.\\d+)?(;|,|$)`).test(st))

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
    for (const headers of [json, {}]) {
      const r = await get(path, { method: 'POST', body: '{}', headers })
      await r.arrayBuffer()
      ok(r.status === 404, `POST ${path}${headers['content-type'] ? '' : ' sin content-type'} → 404 sin secreto (fue ${r.status})`)
    }
  }
  const pv = await get('/p/demo?__pv=1.ab')
  await pv.arrayBuffer()
  ok(pv.status === 404, `/p/demo?__pv → 404 sin secreto (fue ${pv.status})`)
  const opt = await get('/__render', { method: 'OPTIONS', headers: { origin: 'https://hub.saastro.io', 'access-control-request-method': 'POST' } })
  await opt.arrayBuffer()
  ok(opt.status === 404 && !opt.headers.has('access-control-allow-origin'), `OPTIONS /__render → 404 sin secreto, sin CORS (fue ${opt.status})`)
  const dir = await get('/__render', { method: 'POST', body: '{}', headers: { origin: 'https://hub.saastro.io', 'x-saastro-pv': '1.ab' } })
  await dir.arrayBuffer()
  ok(dir.status === 404, `render directo → 404 sin secreto (fue ${dir.status})`)

  const m = await get('/__blocks.json')
  const manifest = m.status === 200 ? await m.json() : []
  ok(Array.isArray(manifest) && manifest.length === 6 && manifest.every((e) => e.jsonSchema?.type === 'object'), '/__blocks.json: 6 entradas (5 tipos) con jsonSchema')
})

// ── 2. Con secreto y sin PAGES_SITE_ID ───────────────────────────────────────
const S = 'paginas-datos-check'
const SITE = 'demo'
const HUB = 'https://hub.example.test'
const hmac = (m) => crypto.createHmac('sha256', S).update(m).digest('hex')
// Contrato del Hub #655: firma atada a site, método y ruta+query.
const sig = (body, { siteId = SITE, metodo = 'POST', ruta = '/__render' } = {}) => {
  const t = Math.floor(Date.now() / 1000)
  return `t=${t},v1=${hmac(`${t}.${siteId}.${metodo}.${ruta}.${body}`)}`
}
const sigVieja = (body) => {
  const t = Math.floor(Date.now() / 1000)
  return `t=${t},v1=${hmac(`${t}.${body}`)}`
}

console.log('Con PAGES_RENDER_SECRET y sin PAGES_SITE_ID:')
await conWorker({ PAGES_RENDER_SECRET: { type: 'plain_text', value: S } }, async (get) => {
  const body = JSON.stringify({ v: 1, siteId: SITE, locale: 'es', block: { id: 'f', type: 'faq', props: { title: 'T', items: [{ q: 'q', a: 'a' }] } } })
  const r = await get('/__render', { method: 'POST', body, headers: { 'x-saastro-sig': sig(body) } })
  await r.arrayBuffer()
  ok(r.status === 404, `/__render firmado sin PAGES_SITE_ID → 404 (fue ${r.status})`)
  const pbody = '{"tags":["pg:demo:es:demo"]}'
  const p = await get('/__purge', { method: 'POST', body: pbody, headers: { 'x-saastro-sig': sig(pbody, { ruta: '/__purge' }) } })
  await p.arrayBuffer()
  ok(p.status === 404, `/__purge firmado sin PAGES_SITE_ID → 404 (fue ${p.status})`)
  const exp = Math.floor(Date.now() / 1000) + 600
  const pv = await get(`/es/p/demo?__pv=${exp}.${hmac(`demo:es:demo:${exp}`)}`)
  await pv.arrayBuffer()
  ok(pv.status === 404, `?__pv válido sin PAGES_SITE_ID → 404 (fue ${pv.status})`)
  const dbody = JSON.stringify({ v: 1, siteId: SITE, locale: 'es', slug: 'demo', block: { id: 'f', type: 'faq', props: { title: 'T', items: [{ q: 'q', a: 'a' }] } } })
  const dir = await get('/__render', { method: 'POST', body: dbody, headers: { origin: 'https://hub.saastro.io', 'x-saastro-pv': `${exp}.${hmac(`demo:es:demo:${exp}`)}` } })
  await dir.arrayBuffer()
  ok(dir.status === 404, `render directo con token válido sin PAGES_SITE_ID → 404 (fue ${dir.status})`)
})

// ── 3. Con secreto y PAGES_SITE_ID ───────────────────────────────────────────
console.log('Con PAGES_RENDER_SECRET y PAGES_SITE_ID:')
await conWorker(
  {
    PAGES_RENDER_SECRET: { type: 'plain_text', value: S },
    PAGES_SITE_ID: { type: 'plain_text', value: SITE },
    PAGES_HUB_ORIGIN: { type: 'plain_text', value: HUB },
    TEMA_BY_HOST: { type: 'plain_text', value: '{"prototipo-b.enlolab.com":"b"}' },
  },
  async (get) => {
    const body = JSON.stringify({ v: 1, siteId: 'demo', locale: 'es', tema: 'b', block: { id: 'h1', type: 'hero', props: { title: ['Hola'], subtitle: 'x', stats: [{ value: '1', label: 'uno' }] } } })
    const r = await get('/__render', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-saastro-sig': sig(body) } })
    const html = await r.text()
    ok(r.status === 200 && html.trimStart().startsWith('<section data-saastro="sec:h1"'), `/__render firmado → solo el bloque (${r.status})`)
    ok(!/<html|<head/i.test(html), '/__render es parcial (sin <html>/<head>)')
    ok(html.includes('bg-primary/5'), '/__render con tema b pinta el hero b')
    ok(/^<section data-saastro="sec:h1" data-tema="b"/.test(html.trimStart()), '/__render con tema b → data-tema="b" en la raíz del fragmento')
    const rst = r.headers.get('server-timing') ?? ''
    ok(fases(rst, ['firma', 'render', 'total']) && /isolate;desc="(frio|caliente)"/.test(rst), `/__render Server-Timing firma + render + total en ms (${rst})`)
    ok(!r.headers.has('x-saastro-fases-ms'), '/__render no filtra la cabecera interna de fases')

    // Sin content-type (un fetch con body string viaja como text/plain): no
    // puede caer en el 403 de checkOrigin antes de llegar a la firma.
    const plano = await get('/__render', { method: 'POST', body, headers: { 'x-saastro-sig': sig(body) } })
    await plano.arrayBuffer()
    ok(plano.status === 200, `/__render firmado sin content-type → 200 (fue ${plano.status})`)

    const bad = await get('/__render', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-saastro-sig': sig(body + ' ') } })
    await bad.arrayBuffer()
    ok(bad.status === 401, `/__render firma mala → 401 (fue ${bad.status})`)

    for (const [nombre, h] of [
      ['formato viejo', sigVieja(body)],
      ['de otro siteId', sig(body, { siteId: 'otro' })],
      ['de otra ruta', sig(body, { ruta: '/__purge' })],
      ['de otro método', sig(body, { metodo: 'PUT' })],
    ]) {
      const r401 = await get('/__render', { method: 'POST', body, headers: { 'x-saastro-sig': h } })
      await r401.arrayBuffer()
      ok(r401.status === 401, `/__render firma ${nombre} → 401 (fue ${r401.status})`)
    }
    const ajeno = JSON.stringify({ ...JSON.parse(body), siteId: 'otro' })
    const r400 = await get('/__render', { method: 'POST', body: ajeno, headers: { 'x-saastro-sig': sig(ajeno) } })
    await r400.arrayBuffer()
    ok(r400.status === 400, `/__render cuerpo con otro siteId → 400 (fue ${r400.status})`)

    const ptags = '{"tags":["pg:otro:es:demo"]}'
    const p400 = await get('/__purge', { method: 'POST', body: ptags, headers: { 'x-saastro-sig': sig(ptags, { ruta: '/__purge' }) } })
    await p400.arrayBuffer()
    ok(p400.status === 400, `/__purge tag de otro siteId → 400 (fue ${p400.status})`)
    const pvieja = '{"tags":["pg:demo:es:demo"]}'
    const p401 = await get('/__purge', { method: 'POST', body: pvieja, headers: { 'x-saastro-sig': sigVieja(pvieja) } })
    await p401.arrayBuffer()
    ok(p401.status === 401, `/__purge firma de formato viejo → 401 (fue ${p401.status})`)

    const exp = Math.floor(Date.now() / 1000) + 600
    const pv = await get(`/es/p/demo?__pv=${exp}.${hmac(`demo:es:demo:${exp}`)}`)
    const pvHtml = await pv.text()
    ok(pv.status === 200, `vista previa firmada → 200 (fue ${pv.status})`)
    const pvst = pv.headers.get('server-timing') ?? ''
    ok(fases(pvst, ['firma', 'doc', 'render', 'total']), `vista previa Server-Timing firma + doc + render + total (${pvst})`)
    ok(pv.headers.get('content-security-policy') === `frame-ancestors 'self' ${HUB}`, `vista previa: frame-ancestors abre ${HUB}`)
    ok(pv.headers.get('cache-control') === 'no-store', 'vista previa: Cache-Control no-store')
    ok(pvHtml.includes('installPreviewBridge') && pvHtml.includes(JSON.stringify(HUB)), 'vista previa: puente postMessage inyectado')

    const pub = await get('/p/demo')
    ok(!(await pub.text()).includes('installPreviewBridge'), 'la página pública no lleva el puente')

    // ── Render directo del navegador ──
    const tok = (k = 'demo:es:demo', e = exp) => `${e}.${hmac(`${k}:${e}`)}`
    const dbody = JSON.stringify({ v: 1, siteId: SITE, locale: 'es', slug: 'demo', tema: 'b', block: { id: 'd1', type: 'faq', props: { title: 'T', items: [{ q: 'q', a: 'a' }] } } })
    const directo = (headers, b = dbody) => get('/__render', { method: 'POST', body: b, headers: { 'content-type': 'application/json', origin: HUB, ...headers } })
    const d = await directo({ 'x-saastro-pv': tok() })
    const dHtml = await d.text()
    ok(d.status === 200 && dHtml.trimStart().startsWith('<section data-saastro="sec:d1" data-tema="b"') && dHtml.includes('data-saastro-field='), `render directo con token → 200 y fragmento con marcadores (${d.status})`)
    ok(d.headers.get('access-control-allow-origin') === HUB && d.headers.get('vary') === 'Origin' && !d.headers.has('access-control-allow-credentials'), `render directo: ACAO = ${HUB}, Vary: Origin, sin credenciales`)
    const dst = d.headers.get('server-timing') ?? ''
    ok(fases(dst, ['firma', 'render', 'total']) && dst.includes('auth;desc="pv"'), `render directo Server-Timing firma + render + total, auth pv (${dst})`)
    for (const [nombre, h, esperado] of [
      ['sin token', { 'x-saastro-pv': '' }, 401],
      ['caducado', { 'x-saastro-pv': tok('demo:es:demo', Math.floor(Date.now() / 1000) - 5) }, 401],
      ['de otro locale', { 'x-saastro-pv': tok('demo:en:demo') }, 401],
      ['de otro site', { 'x-saastro-pv': tok('otro:es:demo') }, 401],
      ['con otro Origin', { 'x-saastro-pv': tok(), origin: 'https://evil.test' }, 403],
    ]) {
      const x = await directo(h)
      const t = await x.text()
      ok(x.status === esperado && !t.includes('<section'), `render directo ${nombre} → ${esperado} sin render (fue ${x.status})`)
      if (nombre === 'con otro Origin') ok(!x.headers.has('access-control-allow-origin'), 'otro Origin → sin cabeceras CORS')
    }
    const pre = await get('/__render', { method: 'OPTIONS', headers: { origin: HUB, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type, x-saastro-pv' } })
    await pre.arrayBuffer()
    ok(
      pre.status === 204 &&
        pre.headers.get('access-control-allow-origin') === HUB &&
        pre.headers.get('access-control-allow-methods') === 'POST, OPTIONS' &&
        pre.headers.get('access-control-allow-headers') === 'content-type, x-saastro-pv' &&
        pre.headers.get('access-control-max-age') === '600' &&
        pre.headers.get('vary') === 'Origin' &&
        !pre.headers.has('access-control-allow-credentials'),
      `OPTIONS con Origin del Hub → 204 con las cabeceras CORS exactas (fue ${pre.status})`,
    )
    const preMal = await get('/__render', { method: 'OPTIONS', headers: { origin: 'https://evil.test', 'access-control-request-method': 'POST' } })
    await preMal.arrayBuffer()
    ok(preMal.status === 403 && !preMal.headers.has('access-control-allow-origin'), `OPTIONS con otro Origin → 403 sin CORS (fue ${preMal.status})`)

    const porHost = {}
    for (const host of ['prototipo.enlolab.com', 'prototipo-b.enlolab.com']) {
      const res = await get('/p/demo', { host })
      porHost[host] = { html: await res.text(), tags: (res.headers.get('cache-tag') ?? '').split(','), st: res.headers.get('server-timing') ?? '', tema: res.headers.get('x-saastro-tema') }
    }
    const pa = porHost['prototipo.enlolab.com']
    const pb = porHost['prototipo-b.enlolab.com']
    ok(pb.html.includes('data-tema="b"') && pb.html.includes('bg-primary/5'), 'Host prototipo-b.enlolab.com → data-tema="b" y hero b')
    ok(pa.html.includes('data-tema="a"') && !pa.html.includes('data-tema="b"'), 'Host prototipo.enlolab.com → data-tema="a"')
    ok(pa.html !== pb.html, 'el HTML de los dos hosts difiere')
    ok(pb.tema === 'b; fuente=mapa' && pa.tema === 'a; fuente=host-fuera-del-mapa', `x-saastro-tema dice el tema y su fuente (${pa.tema} | ${pb.tema})`)
    ok(
      pa.tags.includes('pg:demo:en:demo') && pb.tags.includes('pg:demo:en:demo') &&
        pa.tags.includes('pgh:prototipo.enlolab.com:demo:en:demo') && pb.tags.includes('pgh:prototipo-b.enlolab.com:demo:en:demo') &&
        !pb.tags.includes('pgh:prototipo.enlolab.com:demo:en:demo'),
      `Cache-Tag: el de página común y uno por host (${pb.tags.join(',')})`,
    )
    ok(fases(pa.st, ['doc', 'render', 'total']), `/p/demo Server-Timing doc + render + total en ms (${pa.st})`)

    // El último de este Worker: el proxy de `wrangler dev` pierde la conexión
    // de la petición siguiente cuando el Worker responde sin leer un cuerpo
    // grande (artefacto del banco local, no de Cloudflare).
    const grande = JSON.stringify({ v: 1, siteId: SITE, locale: 'es', slug: 'demo', block: { id: 'g', type: 'faq', props: { title: 'x'.repeat(70_000), items: [] } } })
    const big = await directo({ 'x-saastro-pv': tok() }, grande)
    await big.arrayBuffer()
    ok(big.status === 413, `render directo con cuerpo > 64 KiB → 413 (fue ${big.status})`)
  },
)

// ── 4. TEMA_BY_HOST como var JSON (objeto) ───────────────────────────────────
console.log('TEMA_BY_HOST como var JSON (objeto):')
await conWorker({ TEMA_BY_HOST: { type: 'json', value: { 'prototipo-b.enlolab.com': 'b' } } }, async (get) => {
  const r = await get('/p/demo', { host: 'prototipo-b.enlolab.com' })
  const html = await r.text()
  ok(html.includes('data-tema="b"'), `var JSON → Host prototipo-b pinta data-tema="b" (${r.headers.get('x-saastro-tema')})`)
})

if (fallos.length === 0) {
  console.log(verde('✓ paginas-datos-check — /p/*, /__render, /__purge, ?__pv y /__blocks.json se comportan como el contrato.'))
  process.exit(0)
}
console.error(rojo('✖ paginas-datos-check'))
for (const f of fallos) console.error(`  ${f}`)
process.exit(1)
