import { describe, expect, it } from 'vitest';
import fixture from './fixture.json';
import { pageDocSchema, pageTag, validateBlocks, type BlockRef } from './doc';

const doc = (over: Record<string, unknown> = {}) => ({
  v: 1,
  siteId: 's',
  locale: 'es',
  slug: 'demo',
  rev: 3,
  seo: { title: 'T', description: 'D' },
  blocks: [],
  ...over,
});

describe('documento de página', () => {
  it('acepta la forma del contrato', () => {
    expect(pageDocSchema.safeParse(doc()).success).toBe(true);
    expect(pageDocSchema.safeParse(doc({ rev: 'abc123' })).success).toBe(true);
  });

  it('rechaza versión, slug o seo fuera de contrato', () => {
    expect(pageDocSchema.safeParse(doc({ v: 2 })).success).toBe(false);
    expect(pageDocSchema.safeParse(doc({ slug: '../x' })).success).toBe(false);
    expect(pageDocSchema.safeParse(doc({ seo: { title: 1, description: '' } })).success).toBe(false);
    expect(pageDocSchema.safeParse(doc({ blocks: 'x' })).success).toBe(false);
  });

  it('tag de caché pg:<siteId>:<locale>:<slug>', () => {
    expect(pageTag('s', 'es', 'demo')).toBe('pg:s:es:demo');
  });
});

describe('validación de bloques', () => {
  const faq = (id: string, props: Record<string, unknown>): BlockRef => ({ id, type: 'faq', props });

  it('omite los bloques malos y pinta el resto, contando por qué', () => {
    const { valid, skipped } = validateBlocks(
      [
        faq('ok', { title: 'T', items: [{ q: '¿q?', a: 'a' }] }),
        faq('sin-items', { title: 'T' }),
        { id: 'raro', type: 'carrusel', props: {} },
        faq('ok', { title: 'Repetido', items: [{ q: 'q', a: 'a' }] }),
        faq('con-clase', { title: 'T', items: [{ q: 'q', a: 'a' }], class: 'p-0' }),
        { id: 'blk.1', type: 'faq' },
        null,
      ],
      'a',
    );
    expect(valid.map((b) => b.id)).toEqual(['ok']);
    expect(skipped.map((s) => [s.id, s.reason])).toEqual([
      ['sin-items', 'props-invalidas'],
      ['raro', 'tipo-desconocido'],
      ['ok', 'id-repetido'],
      ['con-clase', 'props-invalidas'],
      ['blk.1', 'forma-invalida'],
      ['?', 'forma-invalida'],
    ]);
  });

  it('un bloque con mala forma no invalida el documento', () => {
    expect(pageDocSchema.safeParse(doc({ blocks: [{ id: 'a:b' }, 42] })).success).toBe(true);
  });

  it('aplica los defaults del esquema y la variante del tema', () => {
    const hero: BlockRef = { id: 'h', type: 'hero', props: { title: ['Hola'], subtitle: 's' } };
    expect(validateBlocks([hero], 'a').valid[0]).toMatchObject({ variant: 'a', props: { stats: [], align: 'start' } });
    expect(validateBlocks([hero], 'b').valid[0]).toMatchObject({ variant: 'b' });
    expect(validateBlocks([{ ...hero, variant: 'a' }], 'b').valid[0]).toMatchObject({ variant: 'b' });
  });
});

describe('fixture', () => {
  it('trae `demo` en es y en en, con los cinco tipos y todos válidos en los dos temas', () => {
    for (const locale of ['es', 'en']) {
      const raw = (fixture as unknown[]).find((d) => (d as { locale: string }).locale === locale);
      const parsed = pageDocSchema.parse(raw);
      expect(parsed.slug).toBe('demo');
      for (const tema of ['a', 'b'] as const) {
        const { valid, skipped } = validateBlocks(parsed.blocks, tema);
        expect(skipped, `${locale}/${tema}`).toEqual([]);
        expect([...new Set(valid.map((b) => b.type))].sort()).toEqual(['cta', 'faq', 'features', 'form', 'hero']);
      }
    }
  });
});
