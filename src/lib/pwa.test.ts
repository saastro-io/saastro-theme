/**
 * El web manifest es OPT-IN. Lo que se protege:
 *   - por defecto (y con cualquier valor que no sea `true`) NO hay manifest;
 *   - encendido, el JSON sale con los datos del site y respaldos sensatos;
 *   - un color inválido no llega al manifest (se descarta con aviso);
 *   - BaseLayout solo emite `<link rel="manifest">` tras `pwa &&` (un link incondicional
 *     — el bug original — rompe esto), y la ruta responde 404 sin PWA;
 *   - public/manifest.json (el estático que se enlazaba siempre) ya no existe.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PWA_MANIFEST_PATH, buildManifest, resolvePwa } from './pwa';
import { getSettings } from './settings';

const site = { name: 'Mi Marca', favicon: { colors: { icon: '#112233', theme: '#112233' } } };
const con = (pwa: unknown) => ({ site, pwa }) as Parameters<typeof resolvePwa>[0];
const leer = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('resolvePwa: apagado por defecto', () => {
  it('el settings.yaml de la plantilla sale APAGADO', () => {
    expect(getSettings().pwa?.enabled).toBe(false);
    expect(resolvePwa(getSettings())).toBeNull();
  });
  it.each([
    ['sin bloque', undefined],
    ['bloque vacío', {}],
    ['enabled false', { enabled: false, name: 'X' }],
    ['enabled "false"', { enabled: 'false' }],
    ['enabled 1', { enabled: 1 }],
    ['enabled "yes"', { enabled: 'yes' }],
    ['null', null],
    ['no objeto', 'true'],
  ])('%s => null', (_n, pwa) => {
    expect(resolvePwa(con(pwa))).toBeNull();
  });
});

describe('resolvePwa: encendido', () => {
  it('usa los datos del site', () => {
    const r = resolvePwa(con({ enabled: true, name: 'Clínica Luz', shortName: 'Luz', themeColor: '#AABBCC', backgroundColor: '#000000' }))!;
    expect(buildManifest(r)).toMatchObject({
      name: 'Clínica Luz', short_name: 'Luz', theme_color: '#AABBCC', background_color: '#000000',
      start_url: '/', display: 'standalone',
    });
    expect(r.rejected).toEqual([]);
  });
  it('la cadena "true" (lo único que escribe el Hub) también enciende', () => {
    expect(resolvePwa(con({ enabled: 'true' }))).not.toBeNull();
  });
  it('vacíos caen a site.name, color del favicon y blanco', () => {
    const m = buildManifest(resolvePwa(con({ enabled: true, name: '  ', shortName: '', themeColor: '', backgroundColor: '' }))!);
    expect(m).toMatchObject({ name: 'Mi Marca', short_name: 'Mi Marca', theme_color: '#112233', background_color: '#ffffff' });
  });
  it('un color inválido se descarta con aviso y no llega al JSON', () => {
    const r = resolvePwa(con({ enabled: true, themeColor: 'red;}</style>', backgroundColor: '#fff' }))!;
    expect(r.rejected).toEqual(['pwa.themeColor', 'pwa.backgroundColor']);
    const j = JSON.stringify(buildManifest(r));
    expect(j).not.toContain('red;');
    expect(r.themeColor).toBe('#112233');
  });
  it('los iconos son los de public/ y existen', () => {
    const m = buildManifest(resolvePwa(con({ enabled: true }))!);
    expect(m.icons.length).toBeGreaterThanOrEqual(4);
    for (const i of m.icons) expect(existsSync(new URL(`../../public${i.src}`, import.meta.url)), i.src).toBe(true);
  });
});

describe('las dos puertas (fuente)', () => {
  const layout = leer('../layouts/BaseLayout.astro');
  it('BaseLayout emite el link SOLO tras `pwa &&`, y una vez', () => {
    const links = layout.split('\n').filter((l) => /rel=["']manifest["']/.test(l));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatch(/\{\s*pwa\s*&&\s*<link rel="manifest" href=\{PWA_MANIFEST_PATH\}/);
    expect(layout).not.toMatch(/href=["']\/manifest\.json["']/);
    expect(layout).toMatch(/const pwa = resolvePwa\(settings\)/);
  });
  it('ninguna otra plantilla enlaza un manifest', () => {
    for (const f of ['../head/Favicons.astro', '../layouts/SiteLayout.astro']) {
      if (existsSync(new URL(f, import.meta.url))) expect(leer(f)).not.toMatch(/rel=["']manifest["']/);
    }
  });
  it('la ruta responde 404 sin PWA y sirve application/manifest+json con PWA', () => {
    const ruta = leer('../pages/manifest.webmanifest.ts');
    expect(ruta).toMatch(/if \(!pwa\) return new Response\(null, \{ status: 404 \}\)/);
    expect(ruta).toContain('PWA_MANIFEST_TYPE');
    expect(PWA_MANIFEST_PATH).toBe('/manifest.webmanifest');
  });
  it('el manifest estático de siempre ya no existe', () => {
    expect(existsSync(new URL('../../public/manifest.json', import.meta.url))).toBe(false);
  });
});
