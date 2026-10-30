import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRegistry, flattenDefs } from '@saastro/studio/pages';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const modules = import.meta.glob('./*/schema.ts', { eager: true, import: 'default' }) as Record<string, unknown>;
const registry = createRegistry(flattenDefs(modules));

const NUEVE = [
  'compare-rows',
  'faq-list',
  'feature-grid',
  'final-cta',
  'home-hero',
  'home-steps',
  'problem-grid',
  'proof-strip',
  'request-site',
];

describe('bloques del theme', () => {
  it('son los 9 de la Home', () => {
    expect([...registry.types].sort()).toEqual(NUEVE);
  });

  it('cada tipo tiene carpeta con schema.ts y Block.astro', () => {
    const dirs = readdirSync(here('./'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect(dirs).toEqual(NUEVE);
    for (const t of NUEVE) {
      expect(existsSync(here(`./${t}/Block.astro`)), t).toBe(true);
      expect(existsSync(here(`./${t}/schema.ts`)), t).toBe(true);
    }
  });

  it('cada demoProps cumple su esquema y rellena los defaults de estilo (paso 0)', () => {
    for (const def of registry.blocks) {
      const r = def.propsSchema.safeParse(def.demoProps);
      expect(r.success, `${def.type}: ${JSON.stringify(!r.success && r.error.issues)}`).toBe(true);
      if (r.success) {
        expect(r.data).toMatchObject({ tono: 'claro', alineacion: 'inicio', espaciado: 'm' });
      }
    }
  });

  it('las props de estilo son enums cerrados; no aceptan clases CSS', () => {
    for (const def of registry.blocks) {
      const base = def.demoProps as object;
      expect(def.propsSchema.safeParse({ ...base, class: 'bg-red-500' }).success, `${def.type} class`).toBe(false);
      expect(def.propsSchema.safeParse({ ...base, tono: 'bg-red-500' }).success, `${def.type} tono`).toBe(false);
      expect(def.propsSchema.safeParse({ ...base, espaciado: 'xl' }).success, `${def.type} espaciado`).toBe(false);
    }
  });

  it('columnas solo en los bloques con rejilla', () => {
    const conColumnas = registry.blocks
      .filter((d) => d.propsSchema.safeParse({ ...(d.demoProps as object), columnas: 3 }).success)
      .map((d) => d.type)
      .sort();
    expect(conColumnas).toEqual(['feature-grid', 'problem-grid']);
  });

  it('los href no aceptan javascript: ni data:', () => {
    const hero = registry.blocks.find((b) => b.type === 'home-hero')!;
    const base = hero.demoProps as Record<string, unknown>;
    for (const href of ['javascript:alert(1)', 'data:text/html,x', '//evil.test', 'http://x.test']) {
      expect(hero.propsSchema.safeParse({ ...base, primaryCta: { label: 'l', href } }).success, href).toBe(false);
    }
    for (const href of ['#contact', '/es/x', 'https://x.test', 'mailto:a@b.c', 'tel:+34']) {
      expect(hero.propsSchema.safeParse({ ...base, primaryCta: { label: 'l', href } }).success, href).toBe(true);
    }
  });

  it('el manifiesto (/__blocks.json) trae los 9 con JSON Schema generado', () => {
    const m = registry.buildManifest();
    expect(m.map((e) => e.slug).sort()).toEqual(NUEVE);
    for (const e of m) {
      const s = e.jsonSchema as { type?: string; properties?: Record<string, unknown> };
      expect(s.type, e.slug).toBe('object');
      expect(Object.keys(s.properties ?? {}), e.slug).toEqual(expect.arrayContaining(['tono', 'alineacion', 'espaciado']));
    }
  });
});
