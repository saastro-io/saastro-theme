/**
 * studio-contract-check sobre un build que NO emite páginas de contenido.
 *
 * El caso (30-sep, hallazgo 01M3RK0NJD de jefe-sites): un site solo SSR
 * (`output: 'server'` + `inlineStylesheets: 'always'`, p. ej. dorjoiers a5368a6)
 * deja en dist/ un único `500.html` y cero `.css`. Con un manifiesto que solo
 * registraba esa página, el check elegía modo dist, «medía» la 500 y salía en
 * verde: los invariantes de secciones, verbatim, paridad y cookies no habían
 * comprobado nada. Un control que pasa sin medir es peor que ninguno.
 *
 * Estos tests corren el script de verdad (`node`) contra fixtures mínimos en
 * un directorio temporal: el código de salida es lo que lee la CI.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'studio-contract-check.mjs')

const CSS = ':root{--x:1}body{font-family:var(--font-body)}h1{font-family:var(--font-display)}.ac{color:red}'

/** Una página que el check da por página: <title>, <header>, registro de lecturas i18n. */
function pagina({ conSeccion = false, css = CSS } = {}) {
  const seccion = conSeccion
    ? '<section data-saastro="sec:hero"><h1 data-saastro-field="hero.title">Hola mundo</h1></section>'
    : '<h1>Error</h1>'
  const style = css ? `<style>${css}</style>` : ''
  return (
    `<!doctype html><html><head><title>Sitio</title>${style}</head><body>` +
    `<header>Marca</header><main>${seccion}</main>` +
    `<script type="application/saastro-i18n-reads">["hero.title"]</script>` +
    `</body></html>`
  )
}

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** Monta un repo mínimo: i18n `en`, src/pages, dist/client y el manifiesto. */
function fixture(opts: {
  srcPages: string[]
  dist: Record<string, string>
  manifest: Record<string, unknown>
}) {
  const root = mkdtempSync(join(tmpdir(), 'contract-check-'))
  dirs.push(root)
  const w = (rel: string, body: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), body)
  }
  w('src/i18n/translations/en.json', JSON.stringify({ hero: { title: 'Hola mundo' } }))
  for (const p of opts.srcPages) w(`src/pages/${p}`, '---\n---\n')
  for (const [k, html] of Object.entries(opts.dist)) w(`dist/client/${k}`, html)
  w('studio-contract.json', JSON.stringify(opts.manifest))
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

describe('studio-contract-check: un build sin páginas de contenido no pasa', () => {
  it('dorjoiers: manifiesto v1 con solo 500.html y rutas SSR en src/pages → exit ≠ 0', () => {
    const root = fixture({
      srcPages: ['500.astro', '[locale]/index.astro', '[locale]/about.astro'],
      dist: { '500.html': pagina() },
      manifest: { version: 1, pages: { '500.html': { sections: {} } } },
    })
    const r = check(root)
    expect(r.code, r.out).not.toBe(0)
    expect(r.out).toContain('[cobertura]')
  })

  it('manifiesto v2 cuyo único HTML es una página de error → exit ≠ 0', () => {
    const root = fixture({
      srcPages: ['500.astro', '[...slug].astro'],
      dist: { '500.html': pagina() },
      manifest: {
        version: 2,
        defaultLocale: 'en',
        locales: ['en'],
        pages: { '500.html': { locale: 'en', route: '/500', crawleable: true, sections: {} } },
      },
    })
    const r = check(root)
    expect(r.code, r.out).not.toBe(0)
    expect(r.out).toContain('[cobertura]')
  })

  it('cero bytes de CSS lo dice como «no medido», no como token ausente', () => {
    const root = fixture({
      srcPages: ['index.astro'],
      dist: { 'index.html': pagina({ conSeccion: true, css: '' }) },
      manifest: {
        version: 2,
        defaultLocale: 'en',
        locales: ['en'],
        pages: { 'index.html': { locale: 'en', route: '/', crawleable: true, sections: { hero: ['hero.title'] } } },
      },
    })
    const r = check(root)
    expect(r.code, r.out).not.toBe(0)
    expect(r.out).toMatch(/\[css-tokens\][\s\S]*NO SE MIDIÓ/)
  })

  it('control: una página de contenido medida con su CSS sigue en verde', () => {
    const root = fixture({
      srcPages: ['index.astro', '500.astro'],
      dist: { 'index.html': pagina({ conSeccion: true }), '500.html': pagina() },
      manifest: {
        version: 2,
        defaultLocale: 'en',
        locales: ['en'],
        pages: {
          'index.html': { locale: 'en', route: '/', crawleable: true, sections: { hero: ['hero.title'] } },
          '500.html': { locale: 'en', route: '/500', crawleable: true, sections: {} },
        },
      },
    })
    const r = check(root)
    expect(r.code, r.out).toBe(0)
    expect(r.out).toContain('1 de contenido')
  })
})
