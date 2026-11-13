/**
 * Invariante 13b (legal-texto): el TEXTO declarado bajo cada ancla `data-legal` no
 * cambia sin que nadie lo vea. Corre el script de verdad contra un repo mínimo en un
 * directorio temporal, y el hash NO se recalcula aquí: se registra con el propio
 * `--update` del script y después se cambia el HTML. Una copia de la función de hash
 * en el test probaría que la copia coincide con la copia, no que el control avisa.
 *
 * Lo que se prueba es que el portero DIGA ALGO: el texto cambia → aviso (o rojo con
 * STUDIO_LEGAL_STRICT=1); texto igual → nada; el cambio de OTRA sección no cuenta.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'studio-contract-check.mjs')
const CSS = ':root{--x:1}body{font-family:var(--font-body)}h1{font-family:var(--font-display)}.ac{color:red}'
const ISLA = `<astro-island component-export="CookieBanner" props='{"cookiesPolicyHref":[0,"/legal/cookies"]}'></astro-island>`

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function pagina(extra = '') {
  return (
    `<!doctype html><html><head><title>Sitio</title><style>${CSS}</style></head><body>` +
    `<header>Marca</header><main><section data-saastro="sec:hero"><h1 data-saastro-field="hero.title">Hola mundo</h1></section>${extra}</main>` +
    `<script type="application/saastro-i18n-reads">["hero.title"]</script></body></html>`
  )
}

const politica = (ga4: string, clarity = 'Grabaciones de sesión de Microsoft.') =>
  `<h2>Cookies de analítica</h2>` +
  `<h3>Google Analytics 4</h3><div data-legal="tracking-ga4"></div><p>${ga4}</p><ul><li><code>_ga</code></li></ul>` +
  `<h3>Microsoft Clarity</h3><div data-legal="tracking-clarity"></div><p>${clarity}</p>`

function site() {
  const root = mkdtempSync(join(tmpdir(), 'legal-texto-'))
  dirs.push(root)
  const w = (rel: string, body: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), body)
  }
  w('src/i18n/translations/en.json', JSON.stringify({ hero: { title: 'Hola mundo' } }))
  w('src/pages/index.astro', '---\n---\n')
  w('src/pages/legal/cookies.astro', '---\n---\n')
  w('src/data/settings.yaml', 'gen:\n  workspaceId: ""\n')
  w('dist/client/index.html', pagina(ISLA))
  w('dist/client/legal/cookies/index.html', pagina(politica('Mide qué páginas visitas.')))
  return { root, w }
}

function run(root: string, args: string[] = [], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: root,
    env: { ...process.env, PUBLIC_WHATSAPP_NUMBER: '', ...env, STUDIO_DEFAULT_LOCALE: 'en' },
    encoding: 'utf8',
  })
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` }
}

/** Un site con el contrato ya REGISTRADO por el propio script. */
function registrado() {
  const s = site()
  const up = run(s.root, ['--update'])
  expect(up.code, up.out).toBe(0)
  return s
}

describe('legal-texto · registro', () => {
  it('--update guarda un hash por ancla, en la página de la política', () => {
    const { root } = registrado()
    const m = JSON.parse(readFileSync(join(root, 'studio-contract.json'), 'utf8'))
    const h = m.legalHashes['legal/cookies/index.html']
    expect(Object.keys(h).sort()).toEqual(['tracking-clarity', 'tracking-ga4'])
    expect(h['tracking-ga4']).toMatch(/^[0-9a-f]{64}$/)
    expect(h['tracking-ga4']).not.toBe(h['tracking-clarity'])
  })
})

describe('legal-texto · el portero dice algo', () => {
  it('texto igual → ningún aviso de legal-texto', () => {
    const { root } = registrado()
    const r = run(root)
    expect(r.out).not.toMatch(/legal-texto/)
  })
  it('el texto de UN ancla cambia → avisa nombrando ESA ancla, sin romper', () => {
    const { root, w } = registrado()
    w('dist/client/legal/cookies/index.html', pagina(politica('Mide páginas, país y dispositivo.')))
    const r = run(root)
    expect(r.out).toMatch(/legal-texto/)
    expect(r.out).toMatch(/tracking-ga4/)
    expect(r.out).not.toMatch(/legal-texto[^\n]*tracking-clarity|tracking-clarity[^\n]*legal-texto/)
    expect(r.code).toBe(0)
  })
  it('con STUDIO_LEGAL_STRICT=1 el mismo cambio sale en ROJO', () => {
    const { root, w } = registrado()
    w('dist/client/legal/cookies/index.html', pagina(politica('Mide páginas, país y dispositivo.')))
    const r = run(root, [], { STUDIO_LEGAL_STRICT: '1' })
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/legal-texto/)
  })
  it('cambiar un espacio o un salto de línea NO cuenta', () => {
    const { root, w } = registrado()
    w('dist/client/legal/cookies/index.html', pagina(politica('Mide   qué\n páginas visitas.')))
    expect(run(root, [], { STUDIO_LEGAL_STRICT: '1' }).out).not.toMatch(/legal-texto/)
  })
  it('un ancla NUEVA sin registrar → avisa', () => {
    const { root, w } = registrado()
    w(
      'dist/client/legal/cookies/index.html',
      pagina(politica('Mide qué páginas visitas.') + `<h3>Meta</h3><div data-legal="tracking-meta"></div><p>Píxel.</p>`),
    )
    const r = run(root)
    expect(r.out).toMatch(/legal-texto/)
    expect(r.out).toMatch(/tracking-meta/)
  })
  it('un ancla registrada que desaparece → avisa', () => {
    const { root, w } = registrado()
    w('dist/client/legal/cookies/index.html', pagina(`<h3>GA4</h3><div data-legal="tracking-ga4"></div><p>Mide qué páginas visitas.</p><ul><li><code>_ga</code></li></ul>`))
    const r = run(root)
    expect(r.out).toMatch(/legal-texto/)
    expect(r.out).toMatch(/tracking-clarity/)
  })
})
