#!/usr/bin/env node
/**
 * critical-css-check — ¿pinta lo mismo la página con SOLO su CSS crítico que con
 * el CSS completo? Sobre el build, incluidas las rutas SSR.
 *
 * El CSS crítico (`src/integrations/critical-css*.{mjs,ts}`) se calcula con un
 * análisis ESTÁTICO del HTML. Ese análisis falló en silencio tres veces (clase
 * `.dark` que pone un script, `:root:has(...)`, `@font-face` que llegan por una
 * variable) y las tres veces la página «cargaba bien»: el fallo era pintar mal
 * hasta que llegaba el CSS completo. Una nota no lo caza; esto sí.
 *
 * Arranca el Worker construido (`dist/server/wrangler.json`, el mismo workerd
 * que `cabeceras-worker-check`), que sirve también los assets, y para cada
 * página, en claro y oscuro y en móvil y escritorio, carga DOS veces con
 * puppeteer:
 *
 *   A. normal (CSS completo)
 *   B. con las hojas `<link rel=stylesheet>` bloqueadas: solo lo que lleva
 *      inline la propia respuesta
 *
 * y falla si difieren el estilo COMPUTADO de algún elemento (y de sus
 * `::before`/`::after`), su caja, las fuentes que llegan a cargarse o las
 * animaciones que arrancan. Los scripts externos se bloquean en las dos: el DOM
 * es el que entrega el servidor, sin lo que crea JS al hidratar (regla general,
 * no lista de rutas: ese contenido solo se estila al llegar el CSS completo, que
 * es el límite conocido del enfoque). Los scripts inline (`ApplyColorMode`, que
 * pone `.dark`) sí corren.
 *
 * Además, por página: (1) ninguna hoja bloqueante en el `<head>` de la respuesta
 * —lo que falla si una ruta SSR pierde su crítico—, y (2) CLS = 0 cuando el CSS
 * completo llega TARDE (1,2 s).
 *
 * Qué páginas: todo el HTML de `dist/client` + las rutas del Worker que se
 * pueden pedir sin configuración: un 404 y cada landing de `src/content/lp`
 * (con vista previa firmada, sin publicar nada). Ninguna lista de rutas.
 *
 * Códigos de salida: 0 ok · 1 diferencias · 2 el control no pudo medir (el
 * fallo es del control, no del site).
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import http from 'node:http'
import puppeteer from 'puppeteer'

const DIST = 'dist/client'
const CONFIG = 'dist/server/wrangler.json'
const CONCURRENCIA = Number(process.env.CRITICAL_CSS_CHECK_CONCURRENCY ?? 4)
const CSS_TARDE_MS = 1200

const rojo = (s) => `\x1b[31m${s}\x1b[0m`
const verde = (s) => `\x1b[32m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`
const nombre = 'critical-css-check'

if (!fs.existsSync(CONFIG) || !fs.existsSync(DIST)) {
  console.error(rojo(`✖ ${nombre} — no existe ${CONFIG}. Corre antes \`astro build\`.`))
  process.exit(2)
}

setTimeout(() => {
  console.error(rojo(`✖ ${nombre} — no terminó en 8 min.`))
  process.exit(2)
}, 8 * 60_000).unref()

// ── qué páginas ───────────────────────────────────────────────────────────────
function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (e.name.endsWith('.html')) out.push(p)
  }
  return out
}

/** Token de vista previa (contrato de `src/lib/lp-preview.ts`), firmado aquí con un secreto de ensayo. */
function tokenPreview(secreto, slug) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const firma = crypto.createHmac('sha256', secreto).update(`lp-preview:${slug}:${exp}`).digest('base64url')
  return `${exp}.${firma}`
}
// Para depurar una página: CRITICAL_CSS_CHECK_ONLY=/about/ node scripts/critical-css-check.mjs
const SOLO = process.env.CRITICAL_CSS_CHECK_ONLY
const SECRETO = 'critical-css-check-' + crypto.randomBytes(8).toString('hex')

/** @type {{ruta: string, que: string, estado?: number}[]} */
const paginas = []
for (const f of walk(DIST).sort()) {
  const rel = path.relative(DIST, f).split(path.sep).join('/')
  const ruta = '/' + rel.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '')
  paginas.push({ ruta, que: 'prerenderizada', estado: 200 })
}
paginas.push({ ruta: '/__critical-css-check-404', que: 'SSR 404', estado: 404 })
const LP_DIR = 'src/content/lp'
if (fs.existsSync(LP_DIR)) {
  for (const f of fs.readdirSync(LP_DIR).filter((n) => /\.mdx?$/.test(n)).sort()) {
    const slug = f.replace(/\.mdx?$/, '')
    paginas.push({ ruta: `/lp/${slug}?preview=${tokenPreview(SECRETO, slug)}`, que: `SSR landing ${slug}`, estado: 200 })
  }
}

// ── «páginas como datos» (`/<locale>/p/<slug>`) ───────────────────────────────
// Esa ruta lee su documento del Hub. Para ejercitarla sin Hub se levanta uno de
// mentira que sirve UNA página con todos los bloques del site (sus `demoProps`,
// que el propio Worker publica en `/__blocks.json`). Sin ruta o sin bloques, se omite.
const SLUG_P = 'critical-css-check'
let docP = null
const hubFalso = http.createServer((rq, rs) => {
  if (rq.url?.startsWith('/api/_public/pages/') && docP) {
    rs.setHeader('content-type', 'application/json')
    return void rs.end(JSON.stringify({ doc: docP }))
  }
  rs.statusCode = 404 // host sin dueño → el Worker cae a PAGES_SITE_ID
  rs.end()
})
await new Promise((ok) => hubFalso.listen(0, '127.0.0.1', ok))
const ORIGEN_HUB = `http://127.0.0.1:${hubFalso.address().port}`

// ── el Worker construido ──────────────────────────────────────────────────────
process.env.WRANGLER_SEND_METRICS ??= 'false'
const { unstable_startWorker } = await import('wrangler')
const worker = await unstable_startWorker({
  config: CONFIG,
  bindings: {
    LP_PREVIEW_SECRET: { type: 'plain_text', value: SECRETO },
    PAGES_RENDER_SECRET: { type: 'plain_text', value: SECRETO },
    PAGES_SITE_ID: { type: 'plain_text', value: 'critical-css-check' },
    PAGES_ORIGIN: { type: 'plain_text', value: ORIGEN_HUB },
  },
  dev: { server: { port: 0 }, inspector: false, logLevel: 'error' },
})
const base = String(await worker.url).replace(/\/$/, '')

try {
  const m = await fetch(`${base}/__blocks.json`)
  const bloques = m.ok ? await m.json() : []
  const locale = (await (await fetch(base + '/')).text()).match(/<html[^>]*\blang=["']?([a-z]{2})/i)?.[1] ?? 'en'
  if (bloques.length) {
    docP = {
      v: 1,
      siteId: 'critical-css-check',
      locale,
      slug: SLUG_P,
      rev: 1,
      seo: { title: 'critical-css-check', description: 'ensayo' },
      blocks: bloques.map((b, i) => ({ id: `b${i}`, type: b.type, variant: b.variant, props: b.demoProps })),
    }
    paginas.push({ ruta: `/${locale}/p/${SLUG_P}`, que: `SSR páginas como datos (${bloques.length} bloques)`, estado: 200 })
  }
} catch {
  // sin la ruta de páginas: no se mide
}

if (SOLO) paginas.splice(0, paginas.length, ...paginas.filter((p) => p.ruta.includes(SOLO)))

const browser = await puppeteer.launch({
  headless: 'shell',
  args: process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
})

// ── medir una página ──────────────────────────────────────────────────────────
const VIEWPORTS = {
  movil: { width: 412, height: 823, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true },
  escritorio: { width: 1280, height: 800, deviceScaleFactor: 1 },
}

/** Se ejecuta DENTRO de la página. */
function instantanea() {
  const aEl = (el) => {
    const cs = getComputedStyle(el)
    const v = {}
    for (let i = 0; i < cs.length; i++) v[cs[i]] = cs.getPropertyValue(cs[i])
    return v
  }
  const firma = (el) => {
    const ruta = []
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const i = n.parentElement ? [...n.parentElement.children].indexOf(n) : 0
      ruta.unshift(`${n.localName}${n.id ? '#' + n.id : ''}${n.classList.length ? '.' + [...n.classList].slice(0, 2).join('.') : ''}[${i}]`)
    }
    return ruta.slice(-4).join(' > ')
  }
  const animaciones = document
    .getAnimations()
    .map((a) => a.animationName || `transition:${a.transitionProperty}`)
    .sort()
  document.getAnimations().forEach((a) => a.cancel())
  const els = []
  for (const el of document.querySelectorAll('html, body, body *')) {
    if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) continue
    const r = el.getBoundingClientRect()
    const e = { s: firma(el), v: aEl(el), r: [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 10) / 10) }
    for (const ps of ['::before', '::after']) {
      const c = getComputedStyle(el, ps).content
      if (c && c !== 'none' && c !== 'normal') {
        const cs = getComputedStyle(el, ps)
        const v = {}
        for (let i = 0; i < cs.length; i++) v[cs[i]] = cs.getPropertyValue(cs[i])
        e[ps] = v
      }
    }
    els.push(e)
  }
  // Fuentes: cuáles llegaron a CARGARSE (lo que el texto usa) y cuáles están
  // DECLARADAS. Cargarse es cuestión de momento (Chrome las pide al maquetar), así
  // que se exige otra cosa, que no depende de él: toda cara cargada con el CSS
  // completo tiene que estar declarada en el crítico.
  const clave = (f) => `${f.family}|${f.weight}|${f.style}|${f.unicodeRange}`
  const unicas = (l) => l.filter((f, i) => l.indexOf(f) === i).sort()
  const fuentes = {
    cargadas: unicas([...document.fonts].filter((f) => f.status === 'loaded').map(clave)),
    declaradas: unicas([...document.fonts].map(clave)),
  }
  return { els, fuentes, animaciones }
}

async function abrir({ ruta, scheme, vp, css, vaciar = false, retraso = 0 }) {
  // Contexto propio: `ApplyColorMode` guarda el tema en localStorage, y un modo
  // claro previo en el mismo perfil dejaba las pruebas «oscuras» en claro.
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  page.cerrar = () => ctx.close()
  await page.setViewport(VIEWPORTS[vp])
  await page.setCacheEnabled(false)
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
  await page.evaluateOnNewDocument(() => {
    window.__cls = 0
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.setRequestInterception(true)
  const retenidas = []
  page.on('request', (rq) => {
    const t = rq.resourceType()
    if (t === 'script') return void rq.abort() // sin hidratar: el DOM es el del servidor
    if (t === 'stylesheet' && !css) return void rq.abort()
    if (t === 'stylesheet' && retraso) return void retenidas.push(setTimeout(() => rq.continue().catch(() => {}), retraso))
    rq.continue().catch(() => {})
  })
  const resp = await page.goto(base + ruta, { waitUntil: retraso ? 'load' : 'networkidle0', timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready.then(() => 0))
  if (vaciar) await page.evaluate(() => document.querySelectorAll('style').forEach((s) => s.remove()))
  return { page, resp, retenidas }
}

/** Diferencias entre dos instantáneas, como líneas legibles. */
function comparar(a, b) {
  const dif = []
  if (a.els.length !== b.els.length) {
    dif.push(`el DOM no es el mismo (${a.els.length} vs ${b.els.length} elementos): el control no puede comparar`)
    return dif
  }
  const porProp = new Map()
  for (let i = 0; i < a.els.length; i++) {
    const x = a.els[i]
    const y = b.els[i]
    const props = []
    for (const k of new Set([...Object.keys(x.v), ...Object.keys(y.v)])) {
      if (x.v[k] !== y.v[k]) props.push(`${k}: «${x.v[k]}» ≠ «${y.v[k]}»`)
    }
    for (const ps of ['::before', '::after']) {
      const px = x[ps] ?? {}
      const py = y[ps] ?? {}
      if (!x[ps] !== !y[ps]) props.push(`${ps}: content «${px.content}» ≠ «${py.content}»`)
      else
        for (const k of new Set([...Object.keys(px), ...Object.keys(py)])) {
          if (px[k] !== py[k]) props.push(`${ps} ${k}: «${px[k]}» ≠ «${py[k]}»`)
        }
    }
    if (x.r.some((n, j) => Math.abs(n - y.r[j]) > 0.5)) props.push(`caja [x,y,w,h]: ${x.r} ≠ ${y.r}`)
    if (props.length) {
      dif.push(`${x.s}\n        ${props.slice(0, 4).join('\n        ')}${props.length > 4 ? `\n        … y ${props.length - 4} más` : ''}`)
      for (const p of props) porProp.set(p.split(':')[0], (porProp.get(p.split(':')[0]) ?? 0) + 1)
    }
  }
  const faltan = a.fuentes.cargadas.filter((f) => !b.fuentes.declaradas.includes(f))
  if (faltan.length) dif.push(`@font-face que el CSS completo carga y el crítico no declara: ${faltan.join(' ; ')}`)
  if (a.animaciones.join() !== b.animaciones.join()) {
    dif.push(`animaciones en marcha: completo=[${a.animaciones}] crítico=[${b.animaciones}]`)
  }
  return dif
}

/** Una página, en un modo. Devuelve las líneas de fallo. */
async function medirPagina(p, scheme, vp) {
  const fallos = []
  const A = await abrir({ ruta: p.ruta, scheme, vp, css: true })
  const B = await abrir({ ruta: p.ruta, scheme, vp, css: false })
  try {
    if (A.resp.status() !== p.estado) {
      fallos.push(`estado ${A.resp.status()} y se esperaba ${p.estado}: la ruta ya no mide lo que este control cree`)
    }
    const a = await A.page.evaluate(instantanea)
    const b = await B.page.evaluate(instantanea)
    fallos.push(...comparar(a, b))
  } finally {
    await A.page.cerrar()
    await B.page.cerrar()
  }
  return fallos
}

async function medirCls(p, scheme) {
  const { page, retenidas } = await abrir({ ruta: p.ruta, scheme, vp: 'movil', css: true, retraso: CSS_TARDE_MS })
  try {
    await new Promise((r) => setTimeout(r, 800))
    const cls = await page.evaluate(() => window.__cls)
    const llego = await page.evaluate(() => [...document.styleSheets].some((s) => s.ownerNode?.tagName === 'LINK'))
    return { cls, llego }
  } finally {
    retenidas.forEach(clearTimeout)
    await page.cerrar()
  }
}

/** Sobre el HTML que SALE del servidor: ¿queda alguna hoja bloqueante en el `<head>`? */
async function estructura(p) {
  const r = await fetch(base + p.ruta, { redirect: 'manual' })
  const html = await r.text()
  const fallos = []
  const fin = html.search(/<\/head>/i)
  const head = fin < 0 ? html : html.slice(0, fin)
  const enHead = head.match(/<link\b[^>]*\brel=["']?stylesheet[^>]*>/gi) ?? []
  const enTotal = html.match(/<link\b[^>]*\brel=["']?stylesheet[^>]*>/gi) ?? []
  const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].reduce((n, m) => n + m[1].length, 0)
  if (enHead.length) fallos.push(`${enHead.length} hoja(s) bloqueante(s) en el <head> (${enHead[0]}): esta ruta no tiene CSS crítico`)
  if (enTotal.length && inline < 200) fallos.push(`hay hoja externa pero el CSS inline son ${inline} bytes: no hay crítico`)
  return { fallos, bytes: html.length, inline, hojas: enTotal.length }
}

// ── ejecución ─────────────────────────────────────────────────────────────────
const MODOS = [
  ['light', 'movil'],
  ['dark', 'movil'],
  ['light', 'escritorio'],
  ['dark', 'escritorio'],
]
const informe = [] // {pagina, modo, fallos}

async function conCola(items, fn) {
  const cola = [...items]
  await Promise.all(
    Array.from({ length: CONCURRENCIA }, async () => {
      while (cola.length) await fn(cola.shift())
    }),
  )
}

let canario = 'no medido'
try {
  // Control positivo: el comparador tiene que VER la diferencia entre la página
  // con su CSS y la misma sin ninguna regla. Si no la ve, está ciego.
  const prueba = paginas.find((p) => p.ruta === '/') ?? paginas[0]
  const A = await abrir({ ruta: prueba.ruta, scheme: 'light', vp: 'movil', css: true })
  const C = await abrir({ ruta: prueba.ruta, scheme: 'light', vp: 'movil', css: false, vaciar: true })
  const n = comparar(await A.page.evaluate(instantanea), await C.page.evaluate(instantanea)).length
  await A.page.cerrar()
  await C.page.cerrar()
  if (n === 0) {
    console.error(rojo(`✖ ${nombre} — el comparador no ve la diferencia entre ${prueba.ruta} con CSS y sin CSS. El fallo es del control.`))
    process.exit(2)
  }
  canario = `${n} elementos distintos sin CSS (el comparador ve)`

  // Otros dos canarios: que «oscuro» y «escritorio» SEAN oscuro y escritorio. Una
  // primera versión de este control pasaba en verde con el modo oscuro roto
  // (el tema se guarda en localStorage y arrastraba el claro de la prueba anterior).
  for (const [que, x, y] of [
    ['oscuro', { scheme: 'light', vp: 'movil' }, { scheme: 'dark', vp: 'movil' }],
    ['escritorio', { scheme: 'light', vp: 'movil' }, { scheme: 'light', vp: 'escritorio' }],
  ]) {
    const P = await abrir({ ruta: prueba.ruta, css: true, ...x })
    const Q = await abrir({ ruta: prueba.ruta, css: true, ...y })
    const d = comparar(await P.page.evaluate(instantanea), await Q.page.evaluate(instantanea)).length
    await P.page.cerrar()
    await Q.page.cerrar()
    if (d === 0) {
      console.error(rojo(`✖ ${nombre} — la prueba «${que}» no difiere de la «claro/móvil» en ${prueba.ruta}: el control no está midiendo ${que}. El fallo es del control.`))
      process.exit(2)
    }
    canario += `; ${que}: ${d} elementos distintos`
  }

  await conCola(paginas, async (p) => {
    const est = await estructura(p)
    informe.push({ p, modo: 'estructura', fallos: est.fallos, nota: `${(est.bytes / 1024).toFixed(1)} KB, ${est.inline} B inline, ${est.hojas} hoja(s) al final` })
    for (const [scheme, vp] of MODOS) {
      informe.push({ p, modo: `${scheme}/${vp}`, fallos: await medirPagina(p, scheme, vp) })
    }
    for (const scheme of ['light', 'dark']) {
      const { cls, llego } = await medirCls(p, scheme)
      const fallos = []
      if (!llego) fallos.push('el CSS completo no llegó a aplicarse en la prueba de CSS tardío: el control no mide')
      if (cls !== 0) fallos.push(`CLS ${cls.toFixed(4)} al llegar el CSS completo (se exige 0)`)
      informe.push({ p, modo: `CLS ${scheme}`, fallos })
    }
  })
} catch (e) {
  console.error(rojo(`✖ ${nombre} — el control reventó: ${e?.stack ?? e}`))
  await browser.close()
  await worker.dispose()
  hubFalso.close()
  process.exit(2)
}
await browser.close()
await worker.dispose()
hubFalso.close()

// ── resultado ─────────────────────────────────────────────────────────────────
const malos = informe.filter((i) => i.fallos.length)
for (const p of paginas) {
  const mios = informe.filter((i) => i.p === p)
  const ko = mios.filter((i) => i.fallos.length)
  const nota = mios.find((i) => i.modo === 'estructura')?.nota ?? ''
  console.log(`  ${ko.length ? rojo('✖') : verde('✓')} ${p.ruta.replace(/\?preview=.*/, '?preview=…')} ${dim(`(${p.que}; ${nota}; ${mios.length - 1} mediciones)`)}`)
}
if (malos.length === 0) {
  console.log(verde(`✓ ${nombre} — ${paginas.length} páginas × claro/oscuro × móvil/escritorio: con solo el CSS crítico pintan igual que con el completo, y CLS = 0 al llegar el CSS tarde.`))
  console.log(dim(`  control positivo: ${canario}`))
  process.exit(0)
}
console.error(rojo(`✖ ${nombre} — el CSS crítico NO pinta igual que el completo.`))
for (const m of malos.slice(0, 12)) {
  console.error(`  ${m.p.ruta.replace(/\?preview=.*/, '?preview=…')} [${m.modo}]`)
  for (const f of m.fallos.slice(0, 6)) console.error(`      ${f}`)
  if (m.fallos.length > 6) console.error(`      … y ${m.fallos.length - 6} más`)
}
if (malos.length > 12) console.error(`  … y ${malos.length - 12} mediciones más con fallos`)
console.error('  Qué hacer: si es un estado de <html> que pone un script antes de pintar, añade su selector a ALLOW_RULES')
console.error('  (src/integrations/critical-css-config.mjs; docs/css-critico.md). Si es una ruta SSR, el middleware no la procesa.')
process.exit(1)
