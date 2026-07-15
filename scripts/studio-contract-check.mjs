#!/usr/bin/env node
/**
 * studio-contract-check — contrato del Studio sobre el DOM construido/SERVIDO.
 *
 * `studio-check.mjs` valida el CÓDIGO FUENTE (mismo doctor que el Hub).
 * Este script valida el RESULTADO contra dos fuentes de verdad:
 *   1. los namespaces de `src/i18n/translations/<locale>.json`
 *   2. el manifiesto commiteado `studio-contract.json` (raíz del repo)
 *
 * Dos FETCHERS para el mismo contrato (los invariantes no cambian):
 *   - modo dist  — lee el HTML prerenderizado de `dist/` (tras `astro build`).
 *   - modo crawl — levanta el server local del linaje del repo (wrangler) y
 *     valida el DOM SERVIDO por HTTP — lo que ve el Studio. Imprescindible en
 *     sites SSR (output:'server' con pocas/ninguna página prerender), donde
 *     dist/ apenas emite HTML.
 *
 * Selección de modo AUTOMÁTICA: si el HTML de dist cubre las rutas del
 * manifiesto → dist (rápido, sin server); si no → crawl. Forzable con --mode=.
 *
 * Linaje de servidor — SIEMPRE por configuración del repo (jamás un comando
 * único ni `astro preview`, que no sirve SSR con el adapter CF):
 *   - wrangler.jsonc|toml con `pages_build_output_dir` → `wrangler pages dev <dir>`
 *   - wrangler con `main` (worker) → `wrangler dev` (con el config generado
 *     por el build en dist/server/wrangler.json si existe — es el que usa
 *     `pnpm deploy` — o el config raíz si no)
 *   - SIN fichero wrangler (Pages git-integration) → el build del adapter CF
 *     emite dist/ con `_worker.js` → `wrangler pages dev dist`
 *
 * Rutas en el manifiesto (v2): `--update` descubre las rutas (páginas de
 * src/pages × locales del i18n del site + HTML de dist) y las graba con
 * `crawleable: true|false` (true = el fetcher las obtuvo con 200 + HTML al
 * generarse; en modo dist una página prerenderizada es un asset estático y es
 * crawleable por construcción). En modo check:
 *   - una ruta que ERA crawleable y deja de serlo (404/500, timeout, no-HTML)
 *     es FALLO de contrato, no warning.
 *   - las rutas que NACIERON no-crawleables quedan como warning conocido,
 *     enumerado en CADA pasada — el conjunto de lo no verificado es explícito
 *     y estable, jamás crece en silencio.
 * Compat: manifiesto v1 (sin rutas) → el check en modo dist sigue funcionando
 * y AVISA de regenerar para tener crawl; el modo crawl exige v2.
 *
 * Uso:
 *   node scripts/studio-contract-check.mjs                    # check (default) — exit 1 si algo falla
 *   node scripts/studio-contract-check.mjs --update           # regenera studio-contract.json (NUNCA automático)
 *   node scripts/studio-contract-check.mjs --mode=dist|crawl  # fuerza el fetcher (default: auto)
 *   node scripts/studio-contract-check.mjs --port=4957        # puerto del server en crawl (default: libre al azar)
 *   node scripts/studio-contract-check.mjs --server-timeout=120  # readiness del server en segundos (default 90)
 *
 * Invariantes (modo check):
 *   1. sec-markers      — secciones data-saastro="sec:<key>" por página = manifiesto; sin duplicados
 *   2. field-markers    — data-saastro-field por sección/página = manifiesto
 *   3. verbatim         — cada hoja i18n "visible" de cada sección presente aparece VERBATIM en el HTML
 *   4. img-raw          — data-saastro="img:…" nunca con src /cdn-cgi/image (imagen raw editable)
 *   5. schema-scripts   — <script type="application/saastro-schema"> parsea, version===1, fields[]
 *   6. locale-parity    — cada página del locale default existe en el resto de locales
 *   7. css-tokens       — el CSS emitido contiene var(--font-body), var(--font-display) y la clase .ac
 *                         (en crawl: <style> inline + los .css referenciados por <link> del mismo server)
 *   8. manage-cookies   — páginas con footer llevan #manage-cookies-btn
 *   8b. cookie-policy   — el href de la política del CookieBanner resuelve (dist o HTTP ok)
 *   9. form-primitives  — form.tsx / field.tsx siguen exportando los nombres del manifiesto
 *  10. architecture     — sha256 de ficheros de arquitectura pura = manifiesto
 *  11. routes           — toda ruta descubierta (src/pages × locales / dist) está en el manifiesto (v2)
 *  12. crawl            — toda ruta crawleable del manifiesto sigue sirviendo 200 + HTML (modo crawl)
 *
 * Cada fallo dice: [invariante] página — sección/campo — qué pasa y qué hacer.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { extname, join, relative } from 'node:path'
import { parse } from 'node-html-parser'
import { resolveDefaultLocale } from './lib/default-locale.mjs'

const ROOT = process.cwd()
const DIST_HTML_ROOTS = ['dist/client', 'dist'] // output:'server' prerenderiza en dist/client; static en dist
const I18N_DIR = join(ROOT, 'src', 'i18n', 'translations')
const PAGES_DIR = join(ROOT, 'src', 'pages')
const MANIFEST_PATH = join(ROOT, 'studio-contract.json')
const DEFAULT_LOCALE = resolveDefaultLocale(ROOT).locale
const MANIFEST_VERSION = 2

// ── flags ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const UPDATE = argv.includes('--update')
const MODE_FLAG = argv.find((a) => a.startsWith('--mode='))?.slice('--mode='.length) ?? null
if (MODE_FLAG != null && MODE_FLAG !== 'dist' && MODE_FLAG !== 'crawl') {
  console.error(`✖ studio-contract-check: --mode inválido "${MODE_FLAG}" (valores: dist | crawl)`)
  process.exit(1)
}
const PORT_FLAG = Number(argv.find((a) => a.startsWith('--port='))?.slice('--port='.length)) || null
const SERVER_TIMEOUT_MS =
  (Number(argv.find((a) => a.startsWith('--server-timeout='))?.slice('--server-timeout='.length)) || 90) * 1000
// primer fetch generoso: workerd compila/arranca el SSR en la primera request
const FETCH_FIRST_TIMEOUT_MS = 30_000
const FETCH_TIMEOUT_MS = 20_000

// Páginas de error single-locale: exentas de paridad de locales.
const LOCALE_PARITY_EXEMPT = new Set(['404.html', '500.html', '404/index.html', '500/index.html'])

// Invariante 3 — exclusiones de hojas i18n (keys estructurales, no texto visible).
const STRUCTURAL_KEY_WORDS = new Set([
  'key', 'id', 'slug', 'url', 'href', 'link', 'src', 'path', 'route',
  'icon', 'image', 'img', 'logo', 'color', 'class', 'variant', 'ogimage',
])
const SKIP_SUBTREES = new Set(['seo', 'meta', 'metadata', 'opengraph', 'og'])

// Ficheros de ARQUITECTURA PURA (invariante 10). studio.config.json y
// src/data/settings.yaml quedan FUERA a propósito: son estado mutable que
// escribe el Hub / el flujo de plantilla.
function architectureFiles() {
  const fixed = [
    'astro.config.mjs',
    'src/middleware.ts',
    'src/integrations/strip-studio-meta-middleware.ts',
    'src/env.d.ts',
    'saastrocms.config.ts',
    'saastro.template.json',
    'src/lib/settings.ts',
    'scripts/studio-check.mjs',
    'scripts/studio-contract-check.mjs', // autoprotección
    'scripts/lib/default-locale.mjs', // ídem: de él depende el default locale de AMBOS checks
  ]
  // content config: el que exista de los dos layouts
  if (existsSync(join(ROOT, 'src/content.config.ts'))) fixed.push('src/content.config.ts')
  else if (existsSync(join(ROOT, 'src/content/config.ts'))) fixed.push('src/content/config.ts')
  // todos los src/i18n/*.ts
  const i18nTs = readdirSync(join(ROOT, 'src', 'i18n'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => `src/i18n/${f}`)
  return [...fixed, ...i18nTs].sort()
}

const FORM_PRIMITIVE_FILES = ['src/components/ui/form.tsx', 'src/components/ui/field.tsx']

// ── helpers ──────────────────────────────────────────────────────────────────
const failures = []
function fail(invariant, page, where, what, fix) {
  failures.push({ invariant, page, where, what, fix })
}

function sha256(buf) {
  return 'sha256:' + createHash('sha256').update(buf).digest('hex')
}

function walkFiles(dir, predicate) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(full, predicate))
    else if (predicate(entry.name)) out.push(full)
  }
  return out.sort()
}

function walkHtmlFiles(dir) {
  return walkFiles(dir, (name) => name.endsWith('.html'))
}

/** Decodifica entidades HTML (named comunes + numéricas) para poder buscar
 *  texto i18n verbatim contra TODO el HTML — texto y atributos a la vez. */
function decodeEntities(html) {
  return html.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    const named = {
      amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
      copy: '©', hellip: '…', mdash: '—', ndash: '–',
      rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
    }
    return named[body] ?? m
  })
}

/** ¿Es esta key una key estructural (no-texto)? Cubre la key exacta y las
 *  variantes camelCase/snake_case terminadas en una palabra estructural
 *  (phoneHref, directions_url, ogImage…). */
function isStructuralKey(key) {
  const lower = key.toLowerCase()
  if (STRUCTURAL_KEY_WORDS.has(lower)) return true
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_.-]+/)
    .filter(Boolean)
  const last = words[words.length - 1]?.toLowerCase()
  return last != null && STRUCTURAL_KEY_WORDS.has(last)
}

function hasPlaceholders(s) {
  return /\{\{[^}]*\}\}|\{[^{}\s][^{}]*\}|%s/.test(s)
}

function isRichSpanArray(v) {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every(
      (item) =>
        item != null &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        typeof item.text === 'string' &&
        Object.keys(item).every((k) => k === 'text' || k === 'marks'),
    )
  )
}

/** Recolecta las hojas string "visibles" de un subtree i18n → [{ path, text }] */
function collectVisibleLeaves(node, keyPath, out) {
  if (node == null) return out
  if (typeof node === 'string') {
    const key = keyPath[keyPath.length - 1] ?? ''
    const bareKey = String(key).replace(/\[\d+\]$/, '')
    if (isStructuralKey(bareKey)) return out
    if (node.trim().length < 3) return out
    if (hasPlaceholders(node)) return out
    out.push({ path: keyPath.join('.'), text: node })
    return out
  }
  if (isRichSpanArray(node)) {
    const key = keyPath[keyPath.length - 1] ?? ''
    if (isStructuralKey(String(key).replace(/\[\d+\]$/, ''))) return out
    node.forEach((span, i) => {
      if (span.text.trim().length >= 3 && !hasPlaceholders(span.text)) {
        out.push({ path: `${keyPath.join('.')}[${i}].text`, text: span.text })
      }
    })
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => {
      const parent = keyPath.slice(0, -1)
      const key = keyPath[keyPath.length - 1] ?? ''
      collectVisibleLeaves(item, [...parent, `${key}[${i}]`], out)
    })
    return out
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (SKIP_SUBTREES.has(k.toLowerCase())) continue
      collectVisibleLeaves(v, [...keyPath, k], out)
    }
  }
  return out
}

// ── inputs ───────────────────────────────────────────────────────────────────
const htmlRoot = DIST_HTML_ROOTS.map((d) => join(ROOT, d)).find(
  (d) => existsSync(d) && walkHtmlFiles(d).length > 0,
)
const distKeys = htmlRoot ? walkHtmlFiles(htmlRoot).map((abs) => relative(htmlRoot, abs)) : []
const distKeySet = new Set(distKeys)

if (!existsSync(join(ROOT, 'dist'))) {
  console.error(
    '✖ studio-contract-check: no existe dist/. Corre `astro build` primero\n' +
      '  (el script se encadena en `pnpm studio:check` / `pnpm studio:contract:update`).',
  )
  process.exit(1)
}

const localeFiles = readdirSync(I18N_DIR).filter((f) => f.endsWith('.json'))
const translations = Object.fromEntries(
  localeFiles.map((f) => [
    f.replace(/\.json$/, ''),
    JSON.parse(readFileSync(join(I18N_DIR, f), 'utf8')),
  ]),
)
const locales = Object.keys(translations).sort()
const defaultLocale = locales.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : locales[0]

/** locale + path lógico (sin prefijo de locale) de una página.
 *  Soporta ambas convenciones de routing de la flota: default SIN prefijo
 *  (este theme — el primer segmento nunca es el locale default) y default
 *  PREFIJADO (sites con routing 'manual' que emiten /en/… también para el
 *  default) — el prefijo se recorta siempre que sea un locale conocido, para
 *  que la paridad de locales compare paths lógicos equivalentes. */
function pageLocale(relPath) {
  const first = relPath.split('/')[0]
  if (locales.includes(first)) {
    return { locale: first, logicalPath: relPath.split('/').slice(1).join('/') }
  }
  return { locale: defaultLocale, logicalPath: relPath }
}

// ── rutas: key de página ↔ ruta HTTP ─────────────────────────────────────────
// La key de página del manifiesto ES el path HTML "lógico" (mismo shape que
// emite un build estático: about/index.html, es/index.html, 500.html…), tanto
// si la página vino de dist como si se descubrió para crawl — así los dos
// fetchers producen el mismo manifiesto y el mismo veredicto.
function routeFromPageKey(key) {
  if (key === 'index.html') return '/'
  if (key.endsWith('/index.html')) return '/' + key.slice(0, -'index.html'.length)
  if (key.endsWith('.html')) return '/' + key.slice(0, -'.html'.length)
  return '/' + key
}

function pageKeyFromSegments(segments) {
  return segments.length ? segments.join('/') + '/index.html' : 'index.html'
}

// Segmento de locale en src/pages: [locale] / [...locale] (y variantes lang).
const LOCALE_PARAM_RE = /^\[(\.\.\.)?(locale|locales|lang|language)\]$/i
const PAGE_EXTS = new Set(['.astro', '.md', '.mdx', '.html'])

/** Descubre rutas estáticamente enumerables de src/pages × locales del i18n
 *  (mismas fuentes que ya usa el checker). Devuelve Map(pageKey → ruta) +
 *  la lista de patterns dinámicos NO enumerables (p.ej. blog/[slug]) — esos
 *  solo entran al contrato si se prerenderizan (vía dist).
 *  Convención de la flota (theme-derived): un rest param [...locale] sirve el
 *  locale default SIN prefijo y el resto prefijado; un param plano [locale]
 *  prefija TODOS los locales. 404/500 son páginas de error, no rutas de
 *  contenido: entran solo si se prerenderizan (vía dist). */
function discoverSrcRoutes() {
  const routes = new Map()
  const dynamicPatterns = []
  if (!existsSync(PAGES_DIR)) return { routes, dynamicPatterns }
  for (const abs of walkFiles(PAGES_DIR, (name) => PAGE_EXTS.has(extname(name)))) {
    const rel = relative(PAGES_DIR, abs)
    const noExt = rel.slice(0, -extname(rel).length)
    let segs = noExt.split('/')
    if (segs.some((s) => s.startsWith('_'))) continue // partials/privados de Astro
    if (segs.length === 1 && (segs[0] === '404' || segs[0] === '500')) continue // páginas de error
    if (segs[segs.length - 1] === 'index') segs = segs.slice(0, -1)

    let localeParam = null // { index, rest }
    let enumerable = true
    segs.forEach((seg, i) => {
      const m = seg.match(LOCALE_PARAM_RE)
      if (m) {
        if (localeParam) enumerable = false // dos params de locale: fuera
        localeParam = { index: i, rest: m[1] === '...' }
      } else if (/^\[.*\]$/.test(seg)) {
        enumerable = false // [slug], [...rest]… no enumerable sin ejecutar getStaticPaths
      }
    })
    if (!enumerable) {
      dynamicPatterns.push('/' + segs.join('/'))
      continue
    }
    const variants = localeParam
      ? locales.map((locale) => {
          const parts = [...segs]
          if (localeParam.rest && locale === defaultLocale) parts.splice(localeParam.index, 1)
          else parts.splice(localeParam.index, 1, locale)
          return parts
        })
      : [segs]
    for (const parts of variants) {
      const key = pageKeyFromSegments(parts)
      routes.set(key, routeFromPageKey(key))
    }
  }
  return { routes, dynamicPatterns }
}

/** Rutas descubiertas = union(HTML de dist, src/pages × locales). */
function discoverRoutes() {
  const { routes, dynamicPatterns } = discoverSrcRoutes()
  const merged = new Map()
  for (const key of distKeys) merged.set(key, routeFromPageKey(key))
  for (const [key, route] of routes) merged.set(key, route)
  return { routes: merged, dynamicPatterns }
}

// ── linaje del server local (SOLO por configuración del repo) ────────────────
function stripJsoncComments(raw) {
  // suficiente para configs wrangler: quita /* … */ y // … fuera de strings
  return raw.replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m, str) => str ?? '')
}

function detectServerLineage() {
  const cfgPath = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml']
    .map((f) => join(ROOT, f))
    .find(existsSync)
  if (cfgPath) {
    const raw = cfgPath.endsWith('.toml')
      ? readFileSync(cfgPath, 'utf8')
      : stripJsoncComments(readFileSync(cfgPath, 'utf8'))
    const pagesDir = raw.match(/["']?pages_build_output_dir["']?\s*[:=]\s*["']([^"']+)["']/)?.[1]
    if (pagesDir) {
      // linaje Pages con config en el repo
      return { kind: 'pages', args: ['pages', 'dev', pagesDir], label: `wrangler pages dev ${pagesDir}` }
    }
    if (/(^|[\s{,])["']?main["']?\s*[:=]/.test(raw)) {
      // linaje worker. El build del adapter CF genera dist/server/wrangler.json
      // (main=entry.mjs + assets=../client) — el MISMO config que usa `pnpm
      // deploy`; con él `wrangler dev` sirve el build sin rebundlear. Fallback:
      // el config raíz.
      const generated = join(ROOT, 'dist', 'server', 'wrangler.json')
      if (existsSync(generated)) {
        return {
          kind: 'worker',
          args: ['dev', '--config', 'dist/server/wrangler.json'],
          label: 'wrangler dev --config dist/server/wrangler.json',
        }
      }
      return {
        kind: 'worker',
        args: ['dev', '--config', relative(ROOT, cfgPath)],
        label: `wrangler dev --config ${relative(ROOT, cfgPath)}`,
      }
    }
    return null
  }
  // SIN fichero wrangler (Pages git-integration): el build del adapter CF
  // emite dist/ con _worker.js → `wrangler pages dev dist`. Los compatibility
  // flags viven en el dashboard de CF, no en el repo — se pasan aquí los que
  // todo site Astro+adapter CF necesita.
  if (existsSync(join(ROOT, 'dist'))) {
    return {
      kind: 'pages-dist',
      args: ['pages', 'dev', 'dist', '--compatibility-date=2025-05-01', '--compatibility-flags=nodejs_compat'],
      label: 'wrangler pages dev dist',
    }
  }
  return null
}

// ── lifecycle del server (timeout duro, kill SIEMPRE) ────────────────────────
let activeServer = null // { child } — para los handlers de salida

function hardKillActiveServer() {
  const child = activeServer?.child
  if (!child || child.exitCode != null) return
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    try { child.kill('SIGKILL') } catch { /* ya muerto */ }
  }
}
process.on('exit', hardKillActiveServer)
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    hardKillActiveServer()
    process.exit(130)
  })
}

async function freePorts(n) {
  const servers = await Promise.all(
    Array.from({ length: n }, () =>
      new Promise((resolve, reject) => {
        const s = createServer()
        s.once('error', reject)
        s.listen(0, '127.0.0.1', () => resolve(s))
      }),
    ),
  )
  const ports = servers.map((s) => s.address().port)
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))))
  return ports
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchWithTimeout(url, ms) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    return await fetch(url, { signal: ctl.signal, headers: { accept: 'text/html' } })
  } finally {
    clearTimeout(t)
  }
}

async function startServer() {
  const lineage = detectServerLineage()
  if (!lineage) {
    throw new Error(
      'no se pudo detectar el linaje de servidor: ni wrangler.jsonc|toml con pages_build_output_dir/main, ni dist/ del adapter CF.\n' +
        '  El modo crawl necesita uno de los tres linajes (ver cabecera del script).',
    )
  }
  const [port, inspectorPort] = PORT_FLAG ? [PORT_FLAG, (await freePorts(1))[0]] : await freePorts(2)
  const wranglerBin = existsSync(join(ROOT, 'node_modules', '.bin', 'wrangler'))
    ? join(ROOT, 'node_modules', '.bin', 'wrangler')
    : 'wrangler'
  const args = [...lineage.args, '--port', String(port), '--inspector-port', String(inspectorPort)]
  const child = spawn(wranglerBin, args, {
    cwd: ROOT,
    detached: process.platform !== 'win32', // process group propio → kill de workerd incluido
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CI: '1', // sin prompts interactivos de wrangler
      WRANGLER_SEND_METRICS: 'false',
      CF_API_TOKEN: '',
      CLOUDFLARE_API_TOKEN: '', // dev local puro: nada de auth remota accidental
    },
  })
  activeServer = { child }
  const logLines = []
  const keepLog = (buf) => {
    for (const line of buf.toString().split('\n')) {
      if (line.trim()) logLines.push(line)
    }
    if (logLines.length > 200) logLines.splice(0, logLines.length - 200)
  }
  child.stdout.on('data', keepLog)
  child.stderr.on('data', keepLog)
  let exited = false
  child.on('exit', () => { exited = true })

  const origin = `http://127.0.0.1:${port}`
  const deadline = Date.now() + SERVER_TIMEOUT_MS
  // readiness: cualquier respuesta HTTP (da igual el status) = server arriba.
  // Generoso a propósito: el primer arranque de wrangler descarga workerd.
  while (Date.now() < deadline) {
    if (exited) break
    try {
      await fetchWithTimeout(origin + '/', 2_000)
      return { origin, lineage, stop: () => stopServer(child) }
    } catch {
      await sleep(500)
    }
  }
  await stopServer(child)
  throw new Error(
    `el server local (${lineage.label}) no respondió en ${SERVER_TIMEOUT_MS / 1000}s` +
      (exited ? ' (el proceso terminó solo)' : '') +
      (logLines.length ? `\n  ── últimas líneas del server ──\n  ${logLines.slice(-25).join('\n  ')}` : ''),
  )
}

async function stopServer(child) {
  if (!child || child.exitCode != null) {
    activeServer = null
    return
  }
  const gone = new Promise((r) => child.once('exit', r))
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    try { child.kill('SIGTERM') } catch { /* ya muerto */ }
  }
  await Promise.race([gone, sleep(5_000)])
  if (child.exitCode == null) {
    try { process.kill(-child.pid, 'SIGKILL') } catch { try { child.kill('SIGKILL') } catch { /* */ } }
    await Promise.race([gone, sleep(2_000)])
  }
  activeServer = null
}

// ── escaneo del DOM (mismo scanner para dist y crawl) ────────────────────────
function nearestSectionKey(el) {
  for (let cur = el.parentNode; cur; cur = cur.parentNode) {
    const attr = cur.getAttribute?.('data-saastro')
    if (attr?.startsWith('sec:')) return attr.slice(4)
  }
  return null
}

function scanPage(html) {
  const root = parse(html)
  const sections = [] // keys en orden, con duplicados si los hay
  const fieldsBySection = {} // key -> [fieldName,...]
  for (const el of root.querySelectorAll('[data-saastro]')) {
    const attr = el.getAttribute('data-saastro') ?? ''
    if (attr.startsWith('sec:')) {
      const key = attr.slice(4)
      sections.push(key)
      fieldsBySection[key] ??= []
    }
  }
  for (const el of root.querySelectorAll('[data-saastro-field]')) {
    const sec = nearestSectionKey(el)
    if (sec == null) continue // marcador suelto fuera de sección: fuera del contrato
    ;(fieldsBySection[sec] ??= []).push(el.getAttribute('data-saastro-field'))
  }
  for (const k of Object.keys(fieldsBySection)) fieldsBySection[k].sort()

  const imgMarkers = root
    .querySelectorAll('[data-saastro]')
    .filter((el) => (el.getAttribute('data-saastro') ?? '').startsWith('img:'))
  const schemaScripts = root.querySelectorAll('script[type="application/saastro-schema"]')
  const hasFooter = sections.includes('footer')
  const hasManageCookies = root.querySelector('#manage-cookies-btn') != null

  // href de la política de cookies: viaja en las props de la isla (el banner
  // SSR-renderiza null, así que el DOM estático no lleva el <a>).
  let cookiePolicyHref = null
  const bannerIsland = root.querySelector('astro-island[component-export="CookieBanner"]')
  if (bannerIsland) {
    try {
      const v = JSON.parse(bannerIsland.getAttribute('props') ?? '{}').cookiesPolicyHref
      if (Array.isArray(v) && typeof v[1] === 'string') cookiePolicyHref = v[1]
    } catch {
      /* props ilegibles: el invariante cookie-policy solo actúa con href extraíble */
    }
  }

  return { html, root, sections, fieldsBySection, imgMarkers, schemaScripts, hasFooter, hasManageCookies, cookiePolicyHref }
}

function scanDistPages() {
  const out = {}
  for (const key of distKeys) out[key] = scanPage(readFileSync(join(htmlRoot, key), 'utf8'))
  return out
}

/** Crawl: fetch de cada ruta contra el server local. 200 + text/html → página
 *  escaneada; cualquier otra cosa → motivo en errors. */
async function crawlPages(origin, routeByKey) {
  const scanned = {}
  const errors = {} // key -> motivo ("HTTP 404", "timeout…", "content-type…")
  let first = true
  for (const [key, route] of [...routeByKey.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const timeout = first ? FETCH_FIRST_TIMEOUT_MS : FETCH_TIMEOUT_MS
    first = false
    let res
    try {
      res = await fetchWithTimeout(origin + route, timeout)
    } catch (e) {
      errors[key] = e.name === 'AbortError' ? `timeout tras ${timeout / 1000}s` : `fetch: ${e.message}`
      continue
    }
    if (res.status !== 200) {
      errors[key] = `HTTP ${res.status}`
      continue
    }
    const ct = res.headers.get('content-type') ?? ''
    if (!/text\/html/i.test(ct)) {
      errors[key] = `content-type "${ct}" (no HTML)`
      continue
    }
    scanned[key] = scanPage(await res.text())
  }
  return { scanned, errors }
}

/** css-tokens en crawl: <style> inline de las páginas escaneadas + fetch de
 *  los .css referenciados por <link rel="stylesheet"> del MISMO server. */
async function crawlCss(origin, scannedPages) {
  const hrefs = new Set()
  for (const p of Object.values(scannedPages)) {
    for (const link of p.root.querySelectorAll('link[rel="stylesheet"]')) {
      const href = link.getAttribute('href')
      if (!href) continue
      let url
      try {
        url = new URL(href, origin)
      } catch {
        continue
      }
      if (url.origin === origin) hrefs.add(url.pathname + url.search)
    }
  }
  const texts = []
  for (const href of [...hrefs].sort()) {
    try {
      const res = await fetchWithTimeout(origin + href, FETCH_TIMEOUT_MS)
      if (res.status === 200) texts.push(await res.text())
    } catch {
      // un .css que no responde caerá como css-tokens si los tokens no aparecen
    }
  }
  return texts.join('\n')
}

// ── exports de form primitives (invariante 9) ────────────────────────────────
function extractExports(source) {
  const names = new Set()
  for (const m of source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1])
  }
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.split(/\s+as\s+/).pop()?.trim()
      if (name) names.add(name)
    }
  }
  return [...names].sort()
}

function currentFormPrimitiveExports() {
  const out = {}
  for (const rel of FORM_PRIMITIVE_FILES) {
    const p = join(ROOT, rel)
    out[rel] = existsSync(p) ? extractExports(readFileSync(p, 'utf8')) : []
  }
  return out
}

function currentArchitectureHashes() {
  const out = {}
  for (const rel of architectureFiles()) {
    const p = join(ROOT, rel)
    if (existsSync(p)) out[rel] = sha256(readFileSync(p))
  }
  return out
}

const CSS_REQUIRES = ['var(--font-body)', 'var(--font-display)', '.ac']

function sectionsOf(p) {
  return Object.fromEntries(
    [...new Set(p.sections)].sort().map((key) => [key, p.fieldsBySection[key] ?? []]),
  )
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  let server = null
  try {
    const discovered = discoverRoutes()

    // ── modo update ──────────────────────────────────────────────────────────
    let pages // key -> scanPage result (páginas VERIFICADAS por el fetcher del modo)
    let mode // 'dist' | 'crawl'
    let crawlErrors = {} // key -> motivo (solo check en crawl)
    let crawledCssText = null

    if (UPDATE) {
      // dist cubre TODAS las rutas descubiertas → dist (estático puro);
      // si no (site SSR) → crawl. --mode fuerza.
      const distCovers = htmlRoot != null && [...discovered.routes.keys()].every((k) => distKeySet.has(k))
      mode = MODE_FLAG ?? (distCovers ? 'dist' : 'crawl')

      const manifestPagesOut = {}
      if (mode === 'dist') {
        if (!htmlRoot) exitNoDistHtml()
        pages = scanDistPages()
        // una página prerenderizada es un asset estático: crawleable por construcción
        for (const [key, p] of Object.entries(pages)) {
          manifestPagesOut[key] = {
            locale: pageLocale(key).locale,
            route: routeFromPageKey(key),
            crawleable: true,
            sections: sectionsOf(p),
          }
        }
      } else {
        server = await startServer()
        console.log(`  server local arriba (${server.lineage.label}) en ${server.origin}`)
        const { scanned, errors } = await crawlPages(server.origin, discovered.routes)
        pages = scanned
        crawledCssText = await crawlCss(server.origin, scanned)
        const distPagesFallback = htmlRoot ? scanDistPages() : {}
        for (const [key, route] of [...discovered.routes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
          const p = scanned[key] ?? distPagesFallback[key] ?? null
          manifestPagesOut[key] = {
            locale: pageLocale(key).locale,
            route,
            crawleable: key in scanned,
            // si la ruta no crawlea pero está prerenderizada, las secciones
            // salen de dist; si no hay NINGUNA fuente de DOM, quedan vacías
            sections: p ? sectionsOf(p) : {},
          }
        }
        for (const [key, reason] of Object.entries(errors)) {
          console.warn(`  ⚠ ruta no crawleable al generar: ${discovered.routes.get(key)} (${reason})`)
        }
      }

      const manifest = {
        version: MANIFEST_VERSION,
        note:
          'Manifiesto del contrato Studio sobre el DOM construido. NO editar a mano ni regenerar automáticamente: ' +
          'se actualiza SOLO con `pnpm studio:contract:update` tras un cambio deliberado de arquitectura/estructura.',
        defaultLocale,
        locales,
        pages: manifestPagesOut,
        css: { requires: CSS_REQUIRES },
        formPrimitiveExports: currentFormPrimitiveExports(),
        // autoprotección: la lista incluye scripts/studio-contract-check.mjs — el
        // hash sale del fichero en disco, así que no hay circularidad con el manifiesto
        architectureHashes: currentArchitectureHashes(),
      }
      writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
      const nCrawleable = Object.values(manifestPagesOut).filter((p) => p.crawleable).length
      console.log(
        `✓ studio-contract.json regenerado (modo ${mode}) — ${Object.keys(manifestPagesOut).length} páginas/rutas ` +
          `(${nCrawleable} crawleables, ${Object.keys(manifestPagesOut).length - nCrawleable} no), ` +
          `${locales.length} locales, ${Object.keys(manifest.architectureHashes).length} ficheros de arquitectura.`,
      )
      if (discovered.dynamicPatterns.length) {
        console.log(
          `  rutas dinámicas no enumerables (entran al contrato solo si se prerenderizan): ` +
            discovered.dynamicPatterns.sort().join(', '),
        )
      }
      console.log('  Revisa el diff y commitéalo: el manifiesto ES el contrato.')
      // seguimos: un check completo contra el manifiesto recién generado detecta
      // los invariantes que NO dependen del manifiesto (verbatim, schema, css…)
    }

    // ── modo check ───────────────────────────────────────────────────────────
    if (!existsSync(MANIFEST_PATH)) {
      console.error(
        '✖ studio-contract-check: falta studio-contract.json en la raíz del repo.\n' +
          '  Genera el manifiesto inicial con: pnpm studio:contract:update (y commitéalo).',
      )
      process.exit(1)
    }
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    const manifestPages = manifest.pages ?? {}
    const manifestV1 = (manifest.version ?? 1) < 2

    if (!UPDATE) {
      const distCovers = htmlRoot != null && Object.keys(manifestPages).every((k) => distKeySet.has(k))
      if (manifestV1) {
        // compat v1: sin rutas no hay crawl — dist sigue funcionando y avisamos.
        if (MODE_FLAG === 'crawl' || !distCovers) {
          console.error(
            '✖ studio-contract-check: el manifiesto es v1 (sin rutas) y ' +
              (MODE_FLAG === 'crawl' ? 'se ha forzado --mode=crawl.' : 'el HTML de dist/ no cubre sus páginas (site SSR).') +
              '\n  Regenera el manifiesto con `pnpm studio:contract:update` (graba rutas + crawleable) y commitéalo.',
          )
          process.exit(1)
        }
        console.warn(
          '⚠ manifiesto v1 (sin rutas): el modo crawl no está disponible hasta regenerarlo con `pnpm studio:contract:update`.',
        )
        mode = 'dist'
        pages = scanDistPages()
      } else {
        mode = MODE_FLAG ?? (distCovers ? 'dist' : 'crawl')
        if (mode === 'dist') {
          if (!htmlRoot) exitNoDistHtml()
          pages = scanDistPages()
        } else {
          const routeByKey = new Map(
            Object.entries(manifestPages)
              .filter(([, entry]) => entry.crawleable !== false)
              .map(([key, entry]) => [key, entry.route ?? routeFromPageKey(key)]),
          )
          server = await startServer()
          console.log(`  server local arriba (${server.lineage.label}) en ${server.origin}`)
          const { scanned, errors } = await crawlPages(server.origin, routeByKey)
          pages = scanned
          crawlErrors = errors
          crawledCssText = await crawlCss(server.origin, scanned)
        }
      }
    }

    // Rutas que NACIERON no-crawleables y este modo no verifica: warning
    // conocido, enumerado en CADA pasada (conjunto explícito y estable).
    const unverifiedKeys = Object.entries(manifestPages)
      .filter(([key, entry]) => entry.crawleable === false && !(key in pages))
      .map(([key]) => key)
      .sort()
    const unverifiedSet = new Set(unverifiedKeys)
    const pageExists = (key) => key in pages || unverifiedSet.has(key)

    // 1 + 2 — marcadores de sección y de campo vs manifiesto
    for (const [rel, entry] of Object.entries(manifestPages)) {
      if (rel in pages || unverifiedSet.has(rel)) continue
      if (mode === 'crawl') {
        if (entry.crawleable !== false) {
          // 12 — la ruta ERA crawleable y dejó de serlo: FALLO de contrato
          const route = entry.route ?? routeFromPageKey(rel)
          fail('crawl', rel, route,
            `la ruta ERA crawleable y dejó de serlo (${crawlErrors[rel] ?? 'sin respuesta'})`,
            'el server local ya no la sirve con 200 + HTML — ruta borrada/renombrada o regresión SSR. Si el cambio es deliberado: pnpm studio:contract:update')
        }
      } else {
        fail('sec-markers', rel, '—', 'la página está en el manifiesto pero no en dist/',
          'si la borraste a propósito, corre `pnpm studio:contract:update`; si no, revisa el build/las rutas')
      }
    }
    for (const [rel, p] of Object.entries(pages)) {
      const entry = manifestPages[rel]
      if (!entry) {
        fail('sec-markers', rel, '—', `página nueva en ${mode === 'crawl' ? 'el server' : 'dist/'} que no está en el manifiesto`,
          'si es deliberada, corre `pnpm studio:contract:update` y commitea el diff')
        continue
      }
      // duplicados dentro de la página
      const seen = new Set()
      for (const key of p.sections) {
        if (seen.has(key)) {
          fail('sec-markers', rel, `sec:${key}`, `la key de sección "${key}" aparece DUPLICADA en la página`,
            'cada sección debe emitir su marcador una sola vez — revisa si el componente se monta dos veces o si un marcador manual convive con el auto-inyectado')
        }
        seen.add(key)
      }
      const want = Object.keys(entry.sections ?? {}).sort()
      const got = [...seen].sort()
      for (const key of want) {
        if (!seen.has(key)) {
          fail('sec-markers', rel, `sec:${key}`, 'sección del manifiesto AUSENTE en el HTML construido',
            'el componente perdió su marcador (frontmatter sin fieldPrefix, raíz PascalCase, o marcador manual borrado). Si el cambio es deliberado: pnpm studio:contract:update')
        }
      }
      for (const key of got) {
        if (!(key in (entry.sections ?? {}))) {
          fail('sec-markers', rel, `sec:${key}`, 'sección presente en el HTML pero NO registrada en el manifiesto',
            'si la sección nueva es deliberada, corre `pnpm studio:contract:update` y commitea el diff')
        }
      }
      // 2 — campos por sección
      for (const [key, wantFields] of Object.entries(entry.sections ?? {})) {
        if (!seen.has(key)) continue // ya reportado arriba
        const gotFields = p.fieldsBySection[key] ?? []
        const wantSorted = [...wantFields].sort()
        const missing = wantSorted.filter((f) => !gotFields.includes(f))
        const extra = gotFields.filter((f) => !wantSorted.includes(f))
        for (const f of missing) {
          fail('field-markers', rel, `sec:${key} → ${f}`, 'data-saastro-field del manifiesto AUSENTE en el DOM',
            'el campo dejó de instrumentarse (¿expresión renombrada/movida? ¿marcador manual quitado?). Deliberado ⇒ pnpm studio:contract:update')
        }
        for (const f of extra) {
          fail('field-markers', rel, `sec:${key} → ${f}`, 'data-saastro-field en el DOM que no está en el manifiesto',
            'si el campo nuevo es deliberado, corre `pnpm studio:contract:update` y commitea el diff')
        }
      }
    }

    // 11 — rutas descubiertas (src/pages × locales / dist) vs manifiesto (solo v2:
    // en v1 no hay contrato de rutas). Detecta páginas SSR nuevas que dist no ve.
    if (!manifestV1) {
      for (const [key, route] of discovered.routes) {
        if (!(key in manifestPages) && !(key in pages)) {
          fail('routes', key, route, 'ruta descubierta (src/pages × locales) que no está en el manifiesto',
            'si la página nueva es deliberada, corre `pnpm studio:contract:update` y commitea el diff')
        }
      }
    }

    // 3 — texto verbatim (precondición de stega/click-to-edit)
    for (const [rel, p] of Object.entries(pages)) {
      const { locale } = pageLocale(rel)
      const t = translations[locale]
      if (!t) continue
      const decoded = decodeEntities(p.html)
      for (const key of new Set(p.sections)) {
        const subtree = t[key]
        if (subtree == null) continue // coherencia marcador↔i18n la valida el doctor (studio-check)
        const leaves = collectVisibleLeaves(subtree, [key], [])
        for (const { path, text } of leaves) {
          if (!decoded.includes(text) && !p.html.includes(text)) {
            fail('verbatim', rel, path, `el texto i18n no aparece VERBATIM en el HTML: "${text}"`,
              'stega y click-to-edit necesitan el texto tal cual. ¿El componente lo transforma (trim/uppercase/concat) o dejó de renderizarlo? Renderiza la hoja sin transformar, o exclúyela del namespace de la sección')
          }
        }
      }
    }

    // 4 — imágenes raw (nunca /cdn-cgi/image en un marcador img:)
    for (const [rel, p] of Object.entries(pages)) {
      for (const el of p.imgMarkers) {
        const marker = el.getAttribute('data-saastro')
        const img = el.tagName?.toLowerCase() === 'img' ? el : el.querySelector('img')
        const src = img?.getAttribute('src') ?? ''
        if (src.startsWith('/cdn-cgi/image')) {
          fail('img-raw', rel, marker, `la imagen editable sale por CF Transformations: src="${src.slice(0, 60)}…"`,
            'un marcador img: debe servir el asset raw (el Studio necesita la URL original para editarla). Pasa raw={true} al <Img> o revisa la lógica raw del componente')
        }
      }
    }

    // 5 — schema scripts
    for (const [rel, p] of Object.entries(pages)) {
      p.schemaScripts.forEach((s, i) => {
        const prefix = s.getAttribute('data-prefix') ?? `#${i}`
        let parsed
        try {
          parsed = JSON.parse(s.textContent)
        } catch (e) {
          fail('schema-scripts', rel, `schema[${prefix}]`, `el JSON del schema no parsea (${e.message})`,
            'el plugin @saastro/studio emite este script; un schema roto rompe el editor de props del Studio. Revisa el componente/la versión del plugin')
          return
        }
        if (parsed.version !== 1) {
          fail('schema-scripts', rel, `schema[${prefix}]`, `version=${JSON.stringify(parsed.version)} (esperado 1)`,
            'el Hub solo entiende version 1. Si @saastro/studio subió el formato, actualiza Hub y manifiesto a la vez')
        }
        if (!Array.isArray(parsed.fields)) {
          fail('schema-scripts', rel, `schema[${prefix}]`, '`fields` no es un array',
            'schema malformado — revisa el componente y la versión del plugin')
        }
      })
    }

    // 6 — paridad de locales (una ruta no verificada pero registrada cuenta
    // como existente: su ausencia real la reporta el invariante de rutas/crawl)
    for (const [rel] of Object.entries(pages)) {
      const { locale, logicalPath } = pageLocale(rel)
      if (locale !== defaultLocale) continue
      if (LOCALE_PARITY_EXEMPT.has(logicalPath)) continue
      for (const other of locales) {
        if (other === defaultLocale) continue
        const expected = `${other}/${logicalPath}`
        if (!pageExists(expected)) {
          fail('locale-parity', rel, `locale ${other}`, `falta la página equivalente ${expected}`,
            'toda página del locale default debe existir en el resto de locales (rutas [...locale]). ¿getStaticPaths se saltó este locale? ¿contenido de colección sin traducción?')
        }
      }
    }

    // 7 — CSS emitido (tokens de fuente + clase .ac)
    {
      // El CSS puede vivir en ficheros .css de dist, inline en <style> (sites
      // con inlineStylesheets:'always'), o — en crawl — en los .css servidos
      // por el server local referenciados desde el HTML. Se escanean todas las
      // fuentes del fetcher activo.
      const inlineCss = Object.values(pages)
        .flatMap((p) => p.root.querySelectorAll('style').map((s) => s.textContent ?? ''))
        .join('\n')
      let externalCss = ''
      if (mode === 'crawl') {
        externalCss = crawledCssText ?? ''
      } else {
        const cssFiles = walkFiles(htmlRoot, (name) => name.endsWith('.css'))
        externalCss = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n')
      }
      const allCss = externalCss + '\n' + inlineCss
      for (const req of manifest.css?.requires ?? CSS_REQUIRES) {
        const ok = req.startsWith('.')
          ? new RegExp(req.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\w-]').test(allCss)
          : allCss.includes(req)
        if (!ok) {
          fail('css-tokens', '(css)', req, `ningún CSS ${mode === 'crawl' ? 'servido' : 'de dist'} contiene "${req}"`,
            req.startsWith('.')
              ? 'la clase se perdió del CSS emitido (¿purga de Tailwind? ¿se dejó de usar en todo el sitio?). El Studio depende de ella'
              : 'la indirección de tokens de fuente desapareció — las fuentes deben rutearse vía :root tokens (--font-body/--font-display), no font-family hardcoded')
        }
      }
    }

    // 8 — botón de cookies
    for (const [rel, p] of Object.entries(pages)) {
      if (p.hasFooter && !p.hasManageCookies) {
        fail('manage-cookies', rel, '#manage-cookies-btn', 'la página tiene footer pero no el botón "Gestionar cookies"',
          'el footer debe renderizar el botón #manage-cookies-btn (prop manageCookiesLabel) — reabre el banner de consentimiento (RGPD)')
      }
    }

    // 8b — el enlace de la política de cookies debe RESOLVER (RGPD). En dos
    // descendientes el banner enlazaba a /legal/cookies… que no existía (404
    // en vivo): la clase exacta de silencio que este checker persigue.
    {
      const firstPageByHref = new Map()
      for (const [rel, p] of Object.entries(pages)) {
        if (p.cookiePolicyHref && !firstPageByHref.has(p.cookiePolicyHref)) {
          firstPageByHref.set(p.cookiePolicyHref, rel)
        }
      }
      for (const [href, rel] of firstPageByHref) {
        if (/^https?:\/\//.test(href)) continue // externo: fuera del alcance del checker
        let ok = false
        if (mode === 'crawl') {
          try {
            const res = await fetch(server.origin + href, {
              redirect: 'follow',
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            })
            ok = res.ok
          } catch {
            ok = false
          }
        } else {
          const clean = href.replace(/^\//, '').replace(/\/$/, '')
          ok = clean === ''
            ? distKeySet.has('index.html')
            : distKeySet.has(`${clean}/index.html`) || distKeySet.has(`${clean}.html`)
        }
        if (!ok) {
          fail('cookie-policy', rel, href,
            `el banner de cookies enlaza a "${href}" y esa ruta NO ${mode === 'crawl' ? 'responde con HTTP ok en el server local' : 'existe en dist'}`,
            'RGPD: la política de cookies enlazada debe existir — crea la página (p.ej. src/pages/legal/…) o corrige la prop cookiesPolicyHref del CookieBanner')
        }
      }
    }

    // 9 — exports de form primitives
    {
      const current = currentFormPrimitiveExports()
      for (const [file, wanted] of Object.entries(manifest.formPrimitiveExports ?? {})) {
        const got = current[file] ?? extractExports(existsSync(join(ROOT, file)) ? readFileSync(join(ROOT, file), 'utf8') : '')
        for (const name of wanted) {
          if (!got.includes(name)) {
            fail('form-primitives', file, name, `el export "${name}" desapareció`,
              '@saastro/forms resuelve estos primitives POR NOMBRE — quitarlos rompe todos los formularios embebidos. Restaura el export o (cambio deliberado y coordinado con @saastro/forms) pnpm studio:contract:update')
          }
        }
      }
    }

    // 10 — no-divergencia de arquitectura
    {
      const current = currentArchitectureHashes()
      for (const [file, wantedHash] of Object.entries(manifest.architectureHashes ?? {})) {
        if (!(file in current)) {
          fail('architecture', file, '—', 'fichero de arquitectura del manifiesto que ya no existe',
            'este fichero es arquitectura del theme. Si el borrado es deliberado, regístralo con `pnpm studio:contract:update`')
          continue
        }
        if (current[file] !== wantedHash) {
          fail('architecture', file, '—', 'el hash sha256 no coincide con el manifiesto',
            'este fichero es ARQUITECTURA PURA del theme — no debería cambiar al editar contenido. Un cambio deliberado de arquitectura se registra con `pnpm studio:contract:update` (y se commitea el diff del manifiesto)')
        }
      }
      for (const file of Object.keys(current)) {
        if (!(file in (manifest.architectureHashes ?? {}))) {
          fail('architecture', file, '—', 'fichero de arquitectura sin hash registrado en el manifiesto',
            'corre `pnpm studio:contract:update` para registrarlo')
        }
      }
    }

    // ── report ───────────────────────────────────────────────────────────────
    const nPages = Object.keys(pages).length
    const sourceLabel =
      mode === 'crawl'
        ? `crawl ${server?.origin ?? ''} · ${server?.lineage.label ?? ''}`
        : htmlRoot.replace(ROOT + '/', '')
    console.log(
      `studio-contract-check — modo ${mode} — ${nPages} páginas (${sourceLabel}), ` +
        `${locales.length} locales, manifiesto v${manifest.version}`,
    )
    if (unverifiedKeys.length) {
      console.warn(
        `⚠ ${unverifiedKeys.length} ruta(s) no verificada(s) — nacieron no-crawleables en el manifiesto:\n` +
          unverifiedKeys
            .map((k) => `    ${manifestPages[k].route ?? routeFromPageKey(k)} (${k})`)
            .join('\n'),
      )
    }
    if (failures.length) {
      for (const f of failures) {
        console.error(`  ✖ [${f.invariant}] ${f.page} — ${f.where}\n      ${f.what}\n      fix: ${f.fix}`)
      }
      console.error(`\n✖ studio-contract-check falló — ${failures.length} invariante(s) roto(s).`)
      process.exitCode = 1
      return
    }
    console.log(`✓ studio-contract-check — contrato del DOM ${mode === 'crawl' ? 'servido' : 'construido'} intacto.`)
  } finally {
    if (server) await server.stop()
  }
}

function exitNoDistHtml() {
  console.error(
    '✖ studio-contract-check: no hay HTML en dist/. Corre `astro build` primero\n' +
      '  (el script se encadena en `pnpm studio:check` / `pnpm studio:contract:update`).',
  )
  process.exit(1)
}

main().catch(async (e) => {
  console.error(`✖ studio-contract-check: ${e.message}`)
  process.exitCode = 1
})
