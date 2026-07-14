#!/usr/bin/env node
/**
 * studio-contract-check — contrato del Studio sobre el HTML CONSTRUIDO.
 *
 * `studio-check.mjs` valida el CÓDIGO FUENTE (mismo doctor que el Hub).
 * Este script valida el RESULTADO: compara `dist/` (tras `astro build`)
 * contra dos fuentes de verdad:
 *   1. los namespaces de `src/i18n/translations/<locale>.json`
 *   2. el manifiesto commiteado `studio-contract.json` (raíz del repo)
 *
 * Modos:
 *   node scripts/studio-contract-check.mjs            # check (default) — exit 1 si algo falla
 *   node scripts/studio-contract-check.mjs --update   # regenera studio-contract.json (NUNCA automático)
 *
 * Invariantes (modo check):
 *   1. sec-markers      — secciones data-saastro="sec:<key>" por página = manifiesto; sin duplicados
 *   2. field-markers    — data-saastro-field por sección/página = manifiesto
 *   3. verbatim         — cada hoja i18n "visible" de cada sección presente aparece VERBATIM en el HTML
 *   4. img-raw          — data-saastro="img:…" nunca con src /cdn-cgi/image (imagen raw editable)
 *   5. schema-scripts   — <script type="application/saastro-schema"> parsea, version===1, fields[]
 *   6. locale-parity    — cada página del locale default existe en el resto de locales
 *   7. css-tokens       — el CSS emitido contiene var(--font-body), var(--font-display) y la clase .ac
 *   8. manage-cookies   — páginas con footer llevan #manage-cookies-btn
 *   9. form-primitives  — form.tsx / field.tsx siguen exportando los nombres del manifiesto
 *  10. architecture     — sha256 de ficheros de arquitectura pura = manifiesto
 *
 * Cada fallo dice: [invariante] página — sección/campo — qué pasa y qué hacer.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parse } from 'node-html-parser'

const ROOT = process.cwd()
const DIST_HTML_ROOTS = ['dist/client', 'dist'] // output:'server' prerenderiza en dist/client; static en dist
const I18N_DIR = join(ROOT, 'src', 'i18n', 'translations')
const MANIFEST_PATH = join(ROOT, 'studio-contract.json')
const DEFAULT_LOCALE = 'en'
const UPDATE = process.argv.includes('--update')

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

function walkHtmlFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkHtmlFiles(full))
    else if (entry.name.endsWith('.html')) out.push(full)
  }
  return out.sort()
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
      amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
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
if (!htmlRoot) {
  console.error(
    '✖ studio-contract-check: no hay HTML en dist/. Corre `astro build` primero\n' +
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

/** locale + path lógico (sin prefijo de locale) de una página de dist */
function pageLocale(relPath) {
  const first = relPath.split('/')[0]
  if (first !== defaultLocale && locales.includes(first)) {
    return { locale: first, logicalPath: relPath.split('/').slice(1).join('/') }
  }
  return { locale: defaultLocale, logicalPath: relPath }
}

// ── escaneo del DOM construido ───────────────────────────────────────────────
function nearestSectionKey(el) {
  for (let cur = el.parentNode; cur; cur = cur.parentNode) {
    const attr = cur.getAttribute?.('data-saastro')
    if (attr?.startsWith('sec:')) return attr.slice(4)
  }
  return null
}

function scanPage(absPath) {
  const html = readFileSync(absPath, 'utf8')
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

  return { html, root, sections, fieldsBySection, imgMarkers, schemaScripts, hasFooter, hasManageCookies }
}

const pages = {}
for (const abs of walkHtmlFiles(htmlRoot)) {
  pages[relative(htmlRoot, abs)] = scanPage(abs)
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

// ── modo update ──────────────────────────────────────────────────────────────
const CSS_REQUIRES = ['var(--font-body)', 'var(--font-display)', '.ac']

if (UPDATE) {
  const manifest = {
    version: 1,
    note:
      'Manifiesto del contrato Studio sobre el DOM construido. NO editar a mano ni regenerar automáticamente: ' +
      'se actualiza SOLO con `pnpm studio:contract:update` tras un cambio deliberado de arquitectura/estructura.',
    defaultLocale,
    locales,
    pages: Object.fromEntries(
      Object.entries(pages).map(([rel, p]) => [
        rel,
        {
          locale: pageLocale(rel).locale,
          sections: Object.fromEntries(
            [...new Set(p.sections)].sort().map((key) => [key, p.fieldsBySection[key] ?? []]),
          ),
        },
      ]),
    ),
    css: { requires: CSS_REQUIRES },
    formPrimitiveExports: currentFormPrimitiveExports(),
    // autoprotección: la lista incluye scripts/studio-contract-check.mjs — el
    // hash sale del fichero en disco, así que no hay circularidad con el manifiesto
    architectureHashes: currentArchitectureHashes(),
  }
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
  console.log(
    `✓ studio-contract.json regenerado — ${Object.keys(manifest.pages).length} páginas, ` +
      `${locales.length} locales, ${Object.keys(manifest.architectureHashes).length} ficheros de arquitectura.`,
  )
  console.log('  Revisa el diff y commitéalo: el manifiesto ES el contrato.')
  // seguimos: un check completo contra el manifiesto recién generado detecta
  // los invariantes que NO dependen del manifiesto (verbatim, schema, css…)
}

// ── modo check ───────────────────────────────────────────────────────────────
if (!existsSync(MANIFEST_PATH)) {
  console.error(
    '✖ studio-contract-check: falta studio-contract.json en la raíz del repo.\n' +
      '  Genera el manifiesto inicial con: pnpm studio:contract:update (y commitéalo).',
  )
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))

// 1 + 2 — marcadores de sección y de campo vs manifiesto
const manifestPages = manifest.pages ?? {}
for (const rel of Object.keys(manifestPages)) {
  if (!pages[rel]) {
    fail('sec-markers', rel, '—', 'la página está en el manifiesto pero no en dist/',
      'si la borraste a propósito, corre `pnpm studio:contract:update`; si no, revisa el build/las rutas')
  }
}
for (const [rel, p] of Object.entries(pages)) {
  const entry = manifestPages[rel]
  if (!entry) {
    fail('sec-markers', rel, '—', 'página nueva en dist/ que no está en el manifiesto',
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

// 6 — paridad de locales
for (const [rel] of Object.entries(pages)) {
  const { locale, logicalPath } = pageLocale(rel)
  if (locale !== defaultLocale) continue
  if (LOCALE_PARITY_EXEMPT.has(logicalPath)) continue
  for (const other of locales) {
    if (other === defaultLocale) continue
    const expected = `${other}/${logicalPath}`
    if (!pages[expected]) {
      fail('locale-parity', rel, `locale ${other}`, `falta la página equivalente ${expected} en dist/`,
        'toda página del locale default debe existir en el resto de locales (rutas [...locale]). ¿getStaticPaths se saltó este locale? ¿contenido de colección sin traducción?')
    }
  }
}

// 7 — CSS emitido (tokens de fuente + clase .ac)
{
  const cssFiles = []
  ;(function walkCss(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walkCss(full)
      else if (entry.name.endsWith('.css')) cssFiles.push(full)
    }
  })(htmlRoot)
  const allCss = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n')
  for (const req of manifest.css?.requires ?? CSS_REQUIRES) {
    const ok = req.startsWith('.')
      ? new RegExp(req.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\w-]').test(allCss)
      : allCss.includes(req)
    if (!ok) {
      fail('css-tokens', '(css)', req, `ningún CSS de dist contiene "${req}"`,
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

// ── report ───────────────────────────────────────────────────────────────────
const nPages = Object.keys(pages).length
console.log(
  `studio-contract-check — ${nPages} páginas (${htmlRoot.replace(ROOT + '/', '')}), ` +
    `${locales.length} locales, manifiesto v${manifest.version}`,
)
if (failures.length) {
  for (const f of failures) {
    console.error(`  ✖ [${f.invariant}] ${f.page} — ${f.where}\n      ${f.what}\n      fix: ${f.fix}`)
  }
  console.error(`\n✖ studio-contract-check falló — ${failures.length} invariante(s) roto(s).`)
  process.exit(1)
}
console.log('✓ studio-contract-check — contrato del DOM construido intacto.')
