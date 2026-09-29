/**
 * La tabla de verdad del invariante `i18n-consumo`: qué cuenta como hoja,
 * qué cuenta como leída y qué queda exento. Se prueba junto con el Proxy de
 * `src/i18n/reads.ts` porque las dos puntas tienen que normalizar igual: si
 * una escribe `menu.0.title` y la otra `menu[].title`, todo sale huérfano.
 */
import { describe, expect, it } from 'vitest';
import { hojasI18n, huerfanas } from './i18n-consumo.mjs';
import { injectReads, trackReads } from '../../src/i18n/reads';

const json = {
  meta: { siteName: 'Acme', pages: { home: { title: 'Home' } } },
  nav: { menu: [{ key: 'home', title: 'Home' }, { key: 'about', title: 'About' }], contact: 'Contact' },
  rich: [{ text: 'Hola ' }, { text: 'mundo', marks: ['bold'] }],
  vacio: [],
  lp: { faqTitle: 'FAQ' },
};

describe('hojasI18n', () => {
  it('normaliza índices a [] y trata los rich spans como una hoja', () => {
    expect([...hojasI18n(json)].sort()).toEqual([
      'lp.faqTitle',
      'meta.pages.home.title',
      'meta.siteName',
      'nav.contact',
      'nav.menu[].key',
      'nav.menu[].title',
      'rich',
    ]);
  });
});

describe('trackReads → huerfanas', () => {
  const leer = (fn: (t: typeof json) => void) => {
    const reads = new Set<string>();
    fn(trackReads(structuredClone(json), reads));
    return reads;
  };

  it('una clave que nadie lee sale huérfana; al leerla deja de salir', () => {
    const sinContact = leer((t) => {
      void t.meta.siteName;
      t.nav.menu.map((i) => i.key + i.title);
    });
    expect(huerfanas(hojasI18n(json), sinContact, ['lp']).huerfanas).toContain('nav.contact');

    const conContact = leer((t) => void t.nav.contact);
    expect(huerfanas(hojasI18n(json), conContact).huerfanas).not.toContain('nav.contact');
  });

  it('basta un elemento del array para que la hoja cuente', () => {
    const reads = leer((t) => void t.nav.menu[1].title);
    expect(reads.has('nav.menu[].title')).toBe(true);
    expect(reads.has('nav.menu[].key')).toBe(false);
  });

  it('serializar el objeto (props de una isla) lo lee entero', () => {
    const reads = leer((t) => void JSON.stringify(t.meta));
    expect(reads.has('meta.pages.home.title')).toBe(true);
  });

  it('leer el padre sin bajar a la hoja NO cuenta', () => {
    const reads = leer((t) => void t.meta);
    expect(huerfanas(hojasI18n(json), reads).huerfanas).toContain('meta.siteName');
  });

  it('lo exento sale como no verificado, nunca como verde silencioso', () => {
    const r = huerfanas(hojasI18n(json), new Set(), ['lp']);
    expect(r.noVerificadas).toEqual(['lp.faqTitle']);
    expect(r.huerfanas).not.toContain('lp.faqTitle');
  });

  it('el Proxy no cambia lo que se lee', () => {
    const t = trackReads(structuredClone(json), new Set());
    expect(t.nav.menu.map((i) => i.title)).toEqual(['Home', 'About']);
    expect(Array.isArray(t.nav.menu)).toBe(true);
    expect(JSON.parse(JSON.stringify(t))).toEqual(json);
  });
});

describe('injectReads', () => {
  it('va antes del último </body> y escapa <', () => {
    const out = injectReads('<html><body><p>x</p></body></html>', new Set(['b', 'a</script>']));
    expect(out).toBe(
      '<html><body><p>x</p><script type="application/saastro-i18n-reads">["a\\u003c/script>","b"]</script></body></html>',
    );
  });
});
