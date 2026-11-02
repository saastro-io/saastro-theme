/**
 * Idioma de las landings: caída al idioma BASE (no a 'es'/'en' fijos) y 404 ante
 * un prefijo que no es un idioma declarado. Medido antes: `/zz/lp/x` = 200 y
 * `/fr/lp/gracias` con base ≠ en salía en inglés.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lpLocaleFromParam, pickByLocale } from './lp-locale';

const BASE_FR = { defaultLocale: 'fr', locales: ['fr', 'es', 'de'] as const };
const BASE_EN = { defaultLocale: 'en', locales: ['en', 'es'] as const };

describe('lpLocaleFromParam', () => {
  it('sin prefijo es el idioma base, sea cual sea', () => {
    expect(lpLocaleFromParam(undefined, BASE_FR)).toEqual({ ok: true, lang: 'fr' });
    expect(lpLocaleFromParam('', BASE_EN)).toEqual({ ok: true, lang: 'en' });
  });
  it('un idioma declarado es válido', () => {
    expect(lpLocaleFromParam('es', BASE_FR)).toEqual({ ok: true, lang: 'es' });
    expect(lpLocaleFromParam('de', BASE_FR)).toEqual({ ok: true, lang: 'de' });
  });
  it('un prefijo basura o de un idioma NO declarado es 404', () => {
    expect(lpLocaleFromParam('zz', BASE_EN)).toEqual({ ok: false });
    expect(lpLocaleFromParam('fr', BASE_EN)).toEqual({ ok: false }); // existe en el mundo, no en locales
    expect(lpLocaleFromParam('es/x', BASE_EN)).toEqual({ ok: false });
    expect(lpLocaleFromParam('ES', BASE_EN)).toEqual({ ok: false });
  });
  it('con la config real también rechaza basura y acepta el base', () => {
    expect(lpLocaleFromParam('zz')).toEqual({ ok: false });
    expect(lpLocaleFromParam(undefined).ok).toBe(true);
  });
});

describe('pickByLocale', () => {
  const COPY = { es: 'hola', en: 'hello' };
  it('usa el idioma pedido si existe', () => {
    expect(pickByLocale(COPY, 'es', 'en')).toBe('hola');
  });
  it('un idioma sin texto cae al idioma BASE, no a inglés fijo', () => {
    expect(pickByLocale(COPY, 'fr', 'es')).toBe('hola');
    expect(pickByLocale(COPY, 'fr', 'en')).toBe('hello');
  });
  it('si la base tampoco tiene texto, queda el último recurso', () => {
    expect(pickByLocale(COPY, 'fr', 'de')).toBe('hello');
  });
});

describe('cableado en las rutas', () => {
  const leer = (rel: string) =>
    readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const slug = leer('../pages/[...locale]/lp/[slug].astro');
  const gracias = leer('../pages/[...locale]/lp/gracias.astro');

  it('ninguna ruta de landing fija es/en como caída', () => {
    for (const src of [slug, gracias]) {
      expect(src).not.toMatch(/\?\?\s*'(es|en)'/);
      expect(src).not.toMatch(/\?\?\s*[A-Z_]+\.(en|es)\b/);
    }
  });
  it('las dos validan el prefijo y devuelven 404 sin redirigir', () => {
    for (const src of [slug, gracias]) {
      expect(src).toMatch(/lpLocaleFromParam\(Astro\.params\.locale\)\.ok/);
      expect(src).toMatch(/new Response\(null, \{ status: 404 \}\)/);
    }
  });
  it('[slug]: el 404 por prefijo va ANTES de leer la colección, y el slug malo/borrador sigue a home', () => {
    expect(slug.indexOf('lpLocaleFromParam')).toBeGreaterThan(-1);
    expect(slug.indexOf('lpLocaleFromParam')).toBeLessThan(slug.indexOf("getCollection('lp')"));
    expect(slug).toMatch(/if \(!entry\) \{\s*return Astro\.redirect\(lp\('\/'\)\);/);
  });
  it('[slug]: conserva los headers de vista previa y noindex', () => {
    expect(slug).toContain("'Cache-Control', 'private, no-store'");
    expect(slug).toContain("'Referrer-Policy', 'no-referrer'");
    expect(slug).toContain("'X-Robots-Tag', 'noindex, nofollow'");
    expect(slug).toContain("'X-Robots-Tag', 'noindex, follow'");
  });
  it('gracias: conserva noindex y no-store', () => {
    expect(gracias).toContain("'X-Robots-Tag', 'noindex, follow'");
    expect(gracias).toContain("'Cache-Control', 'no-store'");
  });
});
