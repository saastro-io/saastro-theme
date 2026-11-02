/**
 * Invariante 8e con landings: un proveedor encendido SOLO en el frontmatter de una
 * landing (publicada o borrador) exige su ancla en la política, igual que uno del
 * site. Corre el script real contra un repo mínimo en un directorio temporal.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'studio-contract-check.mjs');
const CSS = ':root{--x:1}body{font-family:var(--font-body)}h1{font-family:var(--font-display)}.ac{color:red}';
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const ISLA = `<astro-island component-export="CookieBanner" props='{"cookiesPolicyHref":[0,"/legal/cookies"]}'></astro-island>`;
const pagina = (extra = '') =>
  `<!doctype html><html><head><title>Sitio</title><style>${CSS}</style></head><body><header>Marca</header><main>` +
  `<section data-saastro="sec:hero"><h1 data-saastro-field="hero.title">Hola mundo</h1></section>${extra}</main>` +
  `<script type="application/saastro-i18n-reads">["hero.title"]</script></body></html>`;

function repo({ settings = 'tracking:\n  metaPixel: ""\n', landings = {}, marcadores = [] }: { settings?: string; landings?: Record<string, string>; marcadores?: string[] }) {
  const root = mkdtempSync(join(tmpdir(), 'tracking-lp-'));
  dirs.push(root);
  const w = (rel: string, body: string) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), body); };
  w('src/i18n/translations/en.json', JSON.stringify({ hero: { title: 'Hola mundo' } }));
  w('src/pages/index.astro', '---\n---\n');
  w('src/pages/legal/cookies.astro', '---\n---\n');
  w('src/data/settings.yaml', settings);
  for (const [f, fm] of Object.entries(landings)) w(`src/content/lp/${f}`, `---\ntitle: 'x'\n${fm}---\nCuerpo\n`);
  w('dist/client/index.html', pagina(ISLA));
  w('dist/client/legal/cookies/index.html', pagina(marcadores.map((m) => `<div data-legal="${m}"></div>`).join('')));
  w('studio-contract.json', JSON.stringify({
    version: 2, defaultLocale: 'en', locales: ['en'],
    pages: {
      'index.html': { locale: 'en', route: '/', crawleable: true, sections: { hero: ['hero.title'] } },
      'legal/cookies/index.html': { locale: 'en', route: '/legal/cookies', crawleable: true, sections: { hero: ['hero.title'] } },
    },
  }));
  return root;
}
function check(root: string) {
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: root, env: { ...process.env, STUDIO_DEFAULT_LOCALE: 'en' }, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
}

const META = 'tracking:\n  metaPixel: "1111111111111"\n';

describe('8e con el frontmatter de las landings', () => {
  it('control: una landing sin override y sin píxeles → verde', () => {
    expect(check(repo({ landings: { 'a.md': 'draft: false\n' } })).code).toBe(0);
  });

  it('Meta solo en una landing PUBLICADA y la política no lo nombra → rojo, y nombra la landing', () => {
    const r = check(repo({ landings: { 'camp.md': `draft: false\n${META}` } }));
    expect(r.code, r.out).not.toBe(0);
    expect(r.out).toContain('tracking-meta');
    expect(r.out).toContain('camp.md');
  });

  it('lo mismo en un BORRADOR → rojo (no se espera a publicar)', () => {
    const r = check(repo({ landings: { 'camp.md': `draft: true\n${META}` } }));
    expect(r.code, r.out).not.toBe(0);
    expect(r.out).toContain('tracking-meta');
  });

  it('con el ancla en la política → verde', () => {
    const r = check(repo({ landings: { 'camp.md': `draft: true\n${META}` }, marcadores: ['tracking-meta'] }));
    expect(r.code, r.out).toBe(0);
  });

  it('el ancla de OTRO proveedor no cubre a Meta', () => {
    const r = check(repo({ landings: { 'camp.md': META }, marcadores: ['tracking-tiktok'] }));
    expect(r.code, r.out).not.toBe(0);
    expect(r.out).toContain('tracking-meta');
  });

  it('cuentan también en modo replace y con lista de ids', () => {
    const fm = 'trackingMode: replace\ntracking:\n  tiktokPixel: "malo,TTTTTTTTTTTTTTT"\n';
    const r = check(repo({ landings: { 'camp.md': fm } }));
    expect(r.code, r.out).not.toBe(0);
    expect(r.out).toContain('tracking-tiktok');
  });

  it('con varias landings se exige cada proveedor, no solo el de la primera', () => {
    const r = check(repo({
      landings: { 'a.md': META, 'b.md': 'tracking:\n  linkedinPartnerId: "1234567"\n' },
      marcadores: ['tracking-meta'],
    }));
    expect(r.code, r.out).not.toBe(0);
    expect(r.out).toContain('tracking-linkedin');
  });

  it('un id inválido (o sin comillas, que YAML lee como número) no carga y no obliga', () => {
    expect(check(repo({ landings: { 'a.md': 'tracking:\n  metaPixel: "1\');alert(1);//"\n' } })).code).toBe(0);
    expect(check(repo({ landings: { 'a.md': 'tracking:\n  metaPixel: 1111111111111\n' } })).code).toBe(0);
  });

  it('Clarity y Cloudflare en una landing se ignoran (el resolvedor no los aplica): no obligan', () => {
    const fm = 'tracking:\n  clarity: "abcdefgh12"\n  cloudflareWebAnalytics: "ffffffffffffffffffffffffffffffff"\n';
    expect(check(repo({ landings: { 'a.md': fm } })).code).toBe(0);
  });

  it('la etiqueta de conversión sola no es un proveedor', () => {
    expect(check(repo({ landings: { 'a.md': 'tracking:\n  googleAdsConversionLabel: "LabelAAAAAA"\n' } })).code).toBe(0);
  });

  it('el inverso sigue siendo aviso: la política declara Meta que solo una landing tiene → no se avisa de "no encendido"', () => {
    const r = check(repo({ landings: { 'camp.md': META }, marcadores: ['tracking-meta'] }));
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toMatch(/DECLARA Meta Pixel pero el site NO/);
  });

  it('el site con Meta y la landing con Meta a la vez piden un solo ancla (una sola vez)', () => {
    const r = check(repo({ settings: META, landings: { 'camp.md': META } }));
    expect(r.code, r.out).not.toBe(0);
    expect(r.out.match(/ENCENDIDO Meta Pixel \(settings\.yaml, la landing camp\.md\)/g)?.length).toBe(1);
  });

  it('un frontmatter ilegible no tumba el checker (el build de contenido ya falla)', () => {
    const r = check(repo({ landings: { 'rota.md': 'tracking: [\n' } }));
    expect(r.code, r.out).toBe(0);
  });
});
