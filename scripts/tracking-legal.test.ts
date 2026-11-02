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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
function site({ settings, marcadores = [], extraHome = '' }: { settings: string; marcadores?: string[]; extraHome?: string }) {
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
  w('dist/client/index.html', pagina(ISLA + extraHome))
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

function check(root: string, env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [SCRIPT], {
    cwd: root,
    env: { ...process.env, PUBLIC_WHATSAPP_NUMBER: '', ...env, STUDIO_DEFAULT_LOCALE: 'en' },
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

/** Un site cuyo banner NO enlaza a ninguna política interna escaneable. */
function siteSinPolitica(settings: string, islaProps: string | null) {
  const root = site({ settings })
  const w = (rel: string, body: string) => writeFileSync(join(root, rel), body)
  const isla = islaProps == null ? '' : `<astro-island component-export="CookieBanner" props='${islaProps}'></astro-island>`
  w('dist/client/index.html', pagina(isla))
  return root
}

describe('8e: nunca verde sin medir', () => {
  it('píxel encendido y NINGÚN banner con política → rojo', () => {
    const r = check(siteSinPolitica('tracking:\n  metaPixel: "1234567890123"\n', null))
    expect(r.code, r.out).not.toBe(0)
    expect(r.out).toContain('NINGUNA página lleva el banner')
  })

  it('píxel encendido y política EXTERNA (no escaneable) → aviso «NO SE MIDIÓ», no verde mudo', () => {
    const r = check(siteSinPolitica('tracking:\n  metaPixel: "1234567890123"\n', '{"cookiesPolicyHref":[0,"https://ejemplo.com/cookies"]}'))
    expect(r.out).toContain('NO SE MIDIÓ')
    expect(r.out).toContain('tracking-legal')
  })

  it('sin píxeles encendidos y sin política: no opina (verde)', () => {
    const r = check(siteSinPolitica('tracking:\n  metaPixel: ""\n', null))
    expect(r.code, r.out).toBe(0)
  })
})

describe('8e: lista de ids por proveedor', () => {
  it('dos ids de GA4 sin ancla → rojo (una lista no deja el proveedor «apagado» para el checker)', () => {
    const r = check(site({ settings: 'tracking:\n  ga4: "G-AAAAAA0001,G-BBBBBB0002"\n' }))
    expect(r.code, r.out).not.toBe(0)
    expect(r.out).toContain('tracking-ga4')
  })

  it('con ancla → verde', () => {
    const r = check(site({ settings: 'tracking:\n  ga4: "G-AAAAAA0001, G-BBBBBB0002"\n', marcadores: ['tracking-ga4'] }))
    expect(r.code, r.out).toBe(0)
  })

  it('un id válido entre inválidos basta para obligar; si TODOS son inválidos no obliga', () => {
    const uno = check(site({ settings: 'tracking:\n  ga4: "UA-1,G-AAAAAA0001"\n' }))
    expect(uno.code, uno.out).not.toBe(0)
    expect(uno.out).toContain('tracking-ga4')
    const ninguno = check(site({ settings: 'tracking:\n  ga4: "UA-1,G-x"\n' }))
    expect(ninguno.code, ninguno.out).toBe(0)
  })

  it('el legado analytics.googleAnalytics.id también admite lista', () => {
    const r = check(site({ settings: 'analytics:\n  googleAnalytics:\n    id: "G-AAAAAA0001,G-BBBBBB0002"\n' }))
    expect(r.code, r.out).not.toBe(0)
    expect(r.out).toContain('tracking-ga4')
  })
})

describe('8e: proveedor exento de consentimiento (Cloudflare Web Analytics)', () => {
  const TOKEN = 'c0ffee00c0ffee00c0ffee00c0ffee00'

  it('encendido por tracking.cloudflareWebAnalytics y SIN ancla → verde (exención explícita del catálogo)', () => {
    const r = check(site({ settings: `tracking:\n  cloudflareWebAnalytics: "${TOKEN}"\n` }))
    expect(r.code, r.out).toBe(0)
  })

  it('encendido por la ruta vieja analytics.cloudflareWebAnalytics.token y SIN ancla → verde', () => {
    const r = check(site({ settings: `analytics:\n  cloudflareWebAnalytics:\n    token: "${TOKEN}"\n` }))
    expect(r.code, r.out).toBe(0)
  })

  it('NO exime a los demás: con Meta encendido sigue faltando SU ancla y no se pide la de Cloudflare', () => {
    const r = check(site({ settings: `tracking:\n  metaPixel: "1234567890123"\n  cloudflareWebAnalytics: "${TOKEN}"\n` }))
    expect(r.code, r.out).not.toBe(0)
    expect(r.out).toContain('tracking-meta')
    expect(r.out).not.toMatch(/cloudflare/i)
  })

  it('un site con SOLO Cloudflare no necesita banner ni política (no hay nada que declarar): verde, no «NO SE MIDIÓ»', () => {
    const r = check(siteSinPolitica(`tracking:\n  cloudflareWebAnalytics: "${TOKEN}"\n`, null))
    expect(r.code, r.out).toBe(0)
    expect(r.out).not.toContain('NO SE MIDIÓ')
    expect(r.out).not.toContain('NINGUNA página lleva el banner')
  })

  it('la política no declara nada de Cloudflare y no hay aviso inverso por ello', () => {
    const r = check(site({ settings: `tracking:\n  cloudflareWebAnalytics: "${TOKEN}"\n`, marcadores: ['tracking-cloudflare'] }))
    expect(r.code, r.out).toBe(0)
  })

  it('la regla de exención del checker es la del catálogo: category none Y motivo escrito, las dos cosas', () => {
    const fuente = readFileSync(SCRIPT, 'utf8')
    const m = fuente.match(/const trackingExento = \(def\) =>\s*([\s\S]*?)\n\n/)
    if (!m) throw new Error('no se encuentra trackingExento en el checker')
    // eslint-disable-next-line no-new-func
    const exento = new Function('def', `return (${m[1]});`) as (d: Record<string, unknown>) => boolean
    expect(exento({ category: 'none', exemptReason: 'motivo' })).toBe(true)
    expect(exento({ category: 'none' })).toBe(false)
    expect(exento({ category: 'none', exemptReason: '   ' })).toBe(false)
    expect(exento({ category: 'none', exemptReason: 5 })).toBe(false)
    expect(exento({ category: 'analytics', exemptReason: 'motivo' })).toBe(false)
    expect(exento({ category: 'marketing' })).toBe(false)
  })

  it('el catálogo real: Cloudflare es el único exento y todo lo demás lleva ancla', () => {
    const cat = JSON.parse(readFileSync(join(dirname(SCRIPT), '..', 'src', 'lib', 'tracking-providers.json'), 'utf8')).providers
    const sinAncla = cat.filter((p: { marker?: string }) => !p.marker).map((p: { key: string }) => p.key)
    expect(sinAncla).toEqual(['cloudflareWebAnalytics'])
  })
})

describe('sec-markers: secciones condicionales por variable de build', () => {
  const seccion = (k: string) => `<section data-saastro="sec:${k}"></section>`;
  const s = 'tracking:\n  metaPixel: ""\n';

  it('sección sin registrar y SIN variable → rojo (el contrato de la plantilla manda)', () => {
    const r = check(site({ settings: s, extraHome: seccion('whatsapp') }));
    expect(r.code, r.out).not.toBe(0);
    expect(r.out).toContain('sec:whatsapp');
  });

  it('whatsapp sin registrar CON PUBLIC_WHATSAPP_NUMBER → verde con aviso (no falla)', () => {
    const r = check(site({ settings: s, extraHome: seccion('whatsapp') }), { PUBLIC_WHATSAPP_NUMBER: '34000000000' });
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('PUBLIC_WHATSAPP_NUMBER');
  });

  it('la variable no excusa a OTRA sección sin registrar → rojo', () => {
    const r = check(site({ settings: s, extraHome: seccion('banner') }), { PUBLIC_WHATSAPP_NUMBER: '34000000000' });
    expect(r.code, r.out).not.toBe(0);
    expect(r.out).toContain('sec:banner');
  });
});
