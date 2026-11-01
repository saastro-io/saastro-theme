/**
 * hreflang: medido en el HTML construido de main, la página en español (`/es/about/`)
 * emitía `hreflang="es"` → `/es/es/about/` (un 404) y `hreflang="en"` → la propia
 * página en español. Causa: se le pasaba a getHreflangEntries la ruta YA prefijada.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getHreflangEntries, stripLocalePrefix } from '../i18n/utils';

describe('stripLocalePrefix', () => {
  it('quita el prefijo de un idioma no por defecto', () => {
    expect(stripLocalePrefix('/es/about/')).toBe('/about/');
    expect(stripLocalePrefix('/es/')).toBe('/');
    expect(stripLocalePrefix('/es')).toBe('/');
  });
  it('el idioma por defecto no lleva prefijo: la ruta no cambia', () => {
    expect(stripLocalePrefix('/about/')).toBe('/about/');
    expect(stripLocalePrefix('/')).toBe('/');
  });
  it('solo cuenta un SEGMENTO completo: /esoterico no es /es/oterico', () => {
    expect(stripLocalePrefix('/esoterico')).toBe('/esoterico');
    expect(stripLocalePrefix('/es-ES/x')).toBe('/es-ES/x');
  });
  it('un segmento es_ en medio de la ruta no se toca', () => {
    expect(stripLocalePrefix('/blog/es/post')).toBe('/blog/es/post');
  });
});

describe('alternates de una página', () => {
  it('la versión en español y la inglesa generan EXACTAMENTE los mismos alternates', () => {
    const desdeEn = getHreflangEntries(stripLocalePrefix('/about/'));
    const desdeEs = getHreflangEntries(stripLocalePrefix('/es/about/'));
    expect(desdeEs).toEqual(desdeEn);
    expect(desdeEs).toContainEqual({ locale: 'en', href: '/about/' });
    expect(desdeEs).toContainEqual({ locale: 'es', href: '/es/about/' });
  });
  it('nunca duplica el prefijo (/es/es/)', () => {
    for (const p of ['/es/', '/es/about/', '/es/blog/getting-started/']) {
      for (const e of getHreflangEntries(stripLocalePrefix(p))) expect(e.href).not.toMatch(/\/es\/es(\/|$)/);
    }
  });
});

describe('BaseLayout usa las dos piezas', () => {
  const base = readFileSync(new URL('../layouts/BaseLayout.astro', import.meta.url), 'utf8');
  it('pasa la ruta SIN prefijo y no la cruda', () => {
    expect(base).toMatch(/getHreflangEntries\(stripLocalePrefix\(Astro\.url\.pathname\)\)/);
    expect(base).not.toMatch(/getHreflangEntries\(Astro\.url\.pathname\)/);
  });
  it('x-default apunta a la versión del idioma por defecto', () => {
    expect(base).toMatch(/hreflang="x-default" href=\{`\$\{siteUrl\}\$\{xDefaultHref\}`\}/);
  });
});

describe('landings: indexación y alternates', () => {
  const leer = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  it('el esquema trae `indexable` y su valor por defecto es false (opt-in a indexar)', () => {
    expect(leer('../content.config.ts')).toMatch(/indexable: z\.boolean\(\)\.default\(false\)/);
  });
  it('la ruta pasa indexable de la entrada y desactiva los alternates (un .md por slug, un solo idioma)', () => {
    const slug = leer('../pages/[...locale]/lp/[slug].astro');
    expect(slug).toMatch(/indexable=\{landing\.indexable\}/);
    expect(slug).toMatch(/alternates=\{false\}/);
    expect(slug).toMatch(/!landing\.indexable && !isPreview/);
    expect(slug).toContain("'X-Robots-Tag', 'noindex, follow'");
  });
});
