/**
 * Una sola fuente de verdad para los idiomas: `src/i18n/config.ts`.
 *
 * Medido con builds reales (docs/idiomas.md): con la lista de idiomas repetida en
 * astro.config.mjs, en utils.ts (imports a mano) y en content.config.ts (glob),
 * cambiar `config.ts` dejaba el sitemap con todos los hreflang `en`, servía `/fr/`
 * en el idioma base con el build en verde y no generaba `/fr/legal/*`. Estos tests
 * fijan cada derivación; los escenarios completos (builds) los corre
 * `scripts/i18n-escenarios.mjs`.
 */
import { matchesGlob } from 'node:path';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  astroI18n,
  buildTranslationMap,
  effectiveLocales,
  legalEntryParams,
  legalGlob,
  sitemapI18n,
  studioLocales,
} from './i18n-derive';
import { i18nConfig, type Locale } from '../i18n/config';
import { getTranslations } from '../i18n/utils';
import { resolveDeclaredLocales } from '../../scripts/lib/default-locale.mjs';

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

const ES_EN = { enabled: true, defaultLocale: 'es', locales: ['es', 'en'] } as const;
const ES_ONLY = { enabled: true, defaultLocale: 'es', locales: ['es'] } as const;
const OFF = { enabled: false, defaultLocale: 'en', locales: ['en', 'es'] } as const;
const TRES = { enabled: true, defaultLocale: 'es', locales: ['es', 'en', 'fr'] } as const;

describe('idiomas efectivos', () => {
  it('enabled:false equivale a locales:[defaultLocale]', () => {
    expect(effectiveLocales(OFF)).toEqual(['en']);
    expect(effectiveLocales({ ...OFF, enabled: true })).toEqual(['en', 'es']);
  });
  it('un defaultLocale fuera de locales es un error, no un silencio', () => {
    expect(() => effectiveLocales({ enabled: true, defaultLocale: 'fr', locales: ['en', 'es'] })).toThrow(/defaultLocale 'fr'/);
  });
});

describe('astro.config.mjs deriva de config.ts', () => {
  it('i18n de Astro: base y locales salen de la config, no de literales', () => {
    expect(astroI18n(ES_EN)).toEqual({ defaultLocale: 'es', locales: ['es', 'en'], routing: 'manual' });
    expect(astroI18n(OFF).locales).toEqual(['en']);
  });
  it('sitemap con base ≠ en: hreflang es/en, base es (antes: todos «en»)', () => {
    expect(sitemapI18n(ES_EN)).toEqual({ defaultLocale: 'es', locales: { es: 'es', en: 'en' } });
    expect(sitemapI18n(TRES)).toEqual({ defaultLocale: 'es', locales: { es: 'es', en: 'en', fr: 'fr' } });
  });
  it('sitemap con un solo idioma o enabled:false: sin alternates', () => {
    expect(sitemapI18n(ES_ONLY)).toBeUndefined();
    expect(sitemapI18n(OFF)).toBeUndefined();
  });
  it('Studio: el base va primero', () => {
    expect(studioLocales(TRES)).toEqual(['es', 'en', 'fr']);
    expect(studioLocales({ ...TRES, locales: ['en', 'fr', 'es'] })).toEqual(['es', 'en', 'fr']);
  });
  it('astro.config.mjs no lleva ninguna lista de idiomas escrita a mano', () => {
    const src = read('astro.config.mjs');
    expect(src).toMatch(/i18n:\s*astroI18n\(i18nConfig\)/);
    expect(src).toMatch(/i18n:\s*sitemapI18n\(i18nConfig\)/);
    expect(src).toMatch(/locales:\s*studioLocales\(i18nConfig\)/);
    // ningún literal de idioma suelto: ni `locales: [...]`, ni `defaultLocale: '..'`, ni `{ en: 'en' }`
    expect(src).not.toMatch(/\blocales\s*:\s*[\[{]/);
    expect(src).not.toMatch(/\bdefaultLocale\s*:\s*['"]/);
  });
});

describe('traducciones por glob', () => {
  const mods = { './translations/es.json': { a: 1 }, './translations/en.json': { a: 2 }, './translations/fr.json': { a: 3 } };
  it('carga solo los idiomas declarados', () => {
    expect(buildTranslationMap(mods, ES_EN)).toEqual({ es: { a: 1 }, en: { a: 2 } });
  });
  it('un idioma declarado sin su json FALLA y dice cuál y qué fichero', () => {
    const sinFr = { './translations/es.json': {}, './translations/en.json': {} };
    expect(() => buildTranslationMap(sinFr, TRES)).toThrow(/idioma 'fr'.*src\/i18n\/translations\/fr\.json/);
  });
  it('un json sin idioma declarado no se carga', () => {
    expect(Object.keys(buildTranslationMap(mods, ES_ONLY))).toEqual(['es']);
  });
  it('utils.ts usa el glob y no imports a mano de en.json/es.json', () => {
    const src = read('src/i18n/utils.ts');
    expect(src).toMatch(/import\.meta\.glob\(\s*'\.\/translations\/\*\.json'/);
    expect(src).not.toMatch(/from '\.\/translations\//);
  });
  it('cada idioma declarado en el repo tiene su json y se sirve de verdad', () => {
    for (const loc of effectiveLocales(i18nConfig)) {
      expect(() => read(`src/i18n/translations/${loc}.json`)).not.toThrow();
      expect(getTranslations(loc as Locale).meta.title).toBe(JSON.parse(read(`src/i18n/translations/${loc}.json`)).meta.title);
    }
  });
});

describe('legal derivada de los idiomas', () => {
  it('glob: un idioma va SIN llaves (una llave de un solo elemento no casa)', () => {
    expect(legalGlob(ES_ONLY)).toBe('es/*.md');
    expect(legalGlob(ES_EN)).toBe('{es,en}/*.md');
    expect(legalGlob(OFF)).toBe('en/*.md');
  });
  it('el glob casa las carpetas declaradas y no las otras', () => {
    expect(matchesGlob('es/privacy.md', legalGlob(ES_ONLY))).toBe(true);
    expect(matchesGlob('en/privacy.md', legalGlob(ES_ONLY))).toBe(false);
    expect(matchesGlob('fr/privacy.md', legalGlob(ES_EN))).toBe(false);
    expect(matchesGlob('fr/privacy.md', legalGlob(TRES))).toBe(true);
  });
  it('content.config.ts y la ruta legal leen de los idiomas, no de literales', () => {
    expect(read('src/content.config.ts')).toMatch(/pattern:\s*legalGlob\(i18nConfig\)/);
    expect(read('src/content.config.ts')).not.toMatch(/\{en,es\}/);
    expect(read('src/pages/[...locale]/legal/[slug].astro')).toMatch(/legalEntryParams\(/);
  });
  it('rutas: una carpeta de idioma no declarado no genera páginas; el base va sin prefijo', () => {
    const ids = ['es/privacy', 'es/terms', 'en/privacy', 'fr/privacy'];
    expect(legalEntryParams(ids, ES_ONLY)).toEqual([
      { locale: undefined, slug: 'privacy' },
      { locale: undefined, slug: 'terms' },
    ]);
    expect(legalEntryParams(ids, ES_EN).map((p) => `${p.locale ?? ''}/${p.slug}`)).toEqual(['/privacy', '/terms', 'en/privacy']);
  });
});

describe('el resto de la config concuerda', () => {
  it('saastrocms.config.ts (lo lee el Hub por análisis estático) repite los mismos idiomas', () => {
    const src = read('saastrocms.config.ts');
    const locales = [...(/locales:\s*\[([^\]]*)\]/.exec(src)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const base = /defaultLocale:\s*'([^']+)'/.exec(src)?.[1];
    expect([...locales].sort()).toEqual([...i18nConfig.locales].sort());
    expect(base).toBe(i18nConfig.defaultLocale);
  });
  it('un idioma declarado tiene etiqueta y texto de 404 (el tipo lo exige; esto lo comprueba en el repo)', () => {
    const labels = read('src/i18n/config.ts');
    const nf = read('src/lib/not-found.ts');
    for (const loc of i18nConfig.locales) {
      expect(labels).toMatch(new RegExp(`\\b${loc}:\\s*'`));
      expect(nf).toMatch(new RegExp(`\\b${loc}:\\s*\\{`));
    }
  });
});

describe('studio:check solo cuenta los idiomas declarados', () => {
  function repo(config: string) {
    const dir = mkdtempSync(join(tmpdir(), 'i18n-declared-'));
    mkdirSync(join(dir, 'src/i18n'), { recursive: true });
    writeFileSync(join(dir, 'src/i18n/config.ts'), config);
    return dir;
  }
  it('lee locales de config.ts ignorando los comentarios', () => {
    const dir = repo(`// locales: ['zz']\n/* enabled: false */\nexport const i18nConfig = {\n enabled: true,\n defaultLocale: 'es',\n locales: ['es', 'en'],\n} as const;`);
    expect(resolveDeclaredLocales(dir)).toEqual(['es', 'en']);
  });
  it('enabled:false deja solo el base', () => {
    const dir = repo(`export const i18nConfig = {\n enabled: false,\n defaultLocale: 'en',\n locales: ['en', 'es'],\n} as const;`);
    expect(resolveDeclaredLocales(dir)).toEqual(['en']);
  });
  it('sin config.ts, null (el check cae a todos los .json)', () => {
    expect(resolveDeclaredLocales(mkdtempSync(join(tmpdir(), 'i18n-none-')))).toBeNull();
  });
});
