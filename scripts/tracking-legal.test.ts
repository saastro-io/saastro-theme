/**
 * Invariante 8e (tracking-legal): cada píxel encendido en settings.yaml tiene que
 * estar NOMBRADO en la política de cookies. Corre el script de verdad contra un
 * repo mínimo en un directorio temporal; el código de salida es lo que lee la CI.
 *
 * Lo que se prueba no es el caso feliz sino que el portero DIGA NO: encendido sin
 * declarar → rojo; id hostil/ inválido → no cuenta (no carga, no hay tratamiento);
 * y que mirar el DOM no sería suficiente (el píxel vive en settings).
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'studio-contract-check.mjs')
const CSS = ':root{--x:1}body{font-family:var(--font-body)}h1{font-family:var(--font-display)}.ac{color:red}'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const ISLA = `<astro-island component-export="CookieBanner" props='{"cookiesPolicyHref":[0,"/legal/cookies"]}'></astro-island>`

function pagina(extra = '') {
  return (
    `<!doctype html><html><head><title>Sitio</title><style>${CSS}</style></head><body>` +
    `<header>Marca</header><main><section data-saastro="sec:hero"><h1 data-saastro-field="hero.title">Hola mundo</h1></section>${extra}</main>` +
    `<script type="application/saastro-i18n-reads">["hero.title"]</script></body></html>`
  )
}

/** Un site mínimo: portada con el banner, política de cookies, y los settings dados. */
function site({ settings, marcadores = [] }: { settings: string; marcadores?: string[] }) {
  const root = mkdtempSync(join(tmpdir(), 'tracking-legal-'))
  dirs.push(root)
  const w = (rel: string, body: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), body)
  }
  w('src/i18n/translations/en.json', JSON.stringify({ hero: { title: 'Hola mundo' } }))
  w('src/pages/index.astro', '---\n---\n')
  w('src/pages/legal/cookies.astro', '---\n---\n')
  w('src/data/settings.yaml', settings)
  w('dist/client/index.html', pagina(ISLA))
  w('dist/client/legal/cookies/index.html', pagina(marcadores.map((m) => `<div data-legal="${m}"></div>`).join('')))
  w(
    'studio-contract.json',
    JSON.stringify({
      version: 2,
      defaultLocale: 'en',
      locales: ['en'],
      pages: {
        'index.html': { locale: 'en', route: '/', crawleable: true, sections: { hero: ['hero.title'] } },
        'legal/cookies/index.html': { locale: 'en', route: '/legal/cookies', crawleable: true, sections: { hero: ['hero.title'] } },
      },
    }),
  )
  return root
}

function check(root: string) {
  const r = spawnSync(process.execPath, [SCRIPT], {
    cwd: root,
    env: { ...process.env, STUDIO_DEFAULT_LOCALE: 'en' },
    encoding: 'utf8',
  })
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` }
}

describe('8e tracking-legal', () => {
  it('control: sin píxeles encendidos y sin marcadores → verde', () => {
    const r = check(site({ settings: 'tracking:\n  metaPixel: ""\n' }))
    expect(r.code, r.out).toBe(0)
  })

  it('Meta encendido y la política NO lo nombra → rojo, y dice cuál', () => {
    const r = check(site({ settings: 'tracking:\n  metaPixel: "1234567890123"\n' }))
    expect(r.code, r.out).not.toBe(0)
    expect(r.out).toContain('tracking-legal')
    expect(r.out).toContain('tracking-meta')
  })

  it('Meta encendido y la política lo nombra → verde', () => {
    const r = check(site({ settings: 'tracking:\n  metaPixel: "1234567890123"\n', marcadores: ['tracking-meta'] }))
    expect(r.code, r.out).toBe(0)
  })

  it('declarar OTRO proveedor no cubre a Meta (un marcador por proveedor)', () => {
    const r = check(site({ settings: 'tracking:\n  metaPixel: "1234567890123"\n', marcadores: ['tracking-tiktok'] }))
    expect(r.code, r.out).not.toBe(0)
    expect(r.out).toContain('tracking-meta')
  })

  it('el legado analytics.googleAnalytics.id también obliga', () => {
    const r = check(site({ settings: 'analytics:\n  googleAnalytics:\n    id: "G-ABC123XYZ9"\n' }))
    expect(r.code, r.out).not.toBe(0)
    expect(r.out).toContain('tracking-ga4')
  })

  it('un id con formato inválido no carga, así que no obliga', () => {
    const r = check(site({ settings: 'tracking:\n  metaPixel: "1\');alert(1);//"\n' }))
    expect(r.code, r.out).toBe(0)
  })

  it('varios encendidos: faltan los dos nombres, no solo el primero', () => {
    const r = check(site({ settings: 'tracking:\n  metaPixel: "1234567890123"\n  clarity: "abcdefgh12"\n' }))
    expect(r.code, r.out).not.toBe(0)
    expect(r.out).toContain('tracking-meta')
    expect(r.out).toContain('tracking-clarity')
  })

  it('el inverso (política declara, site apagado) es AVISO, no fallo', () => {
    const r = check(site({ settings: 'tracking:\n  metaPixel: ""\n', marcadores: ['tracking-meta'] }))
    expect(r.code, r.out).toBe(0)
    expect(r.out).toContain('tracking-legal')
  })
})
