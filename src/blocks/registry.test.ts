import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLOCKS, BLOCK_TYPES, buildManifest, resolveBlock } from './registry';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

describe('registro de bloques', () => {
  it('cinco tipos: hero, features, faq, cta, form', () => {
    expect([...BLOCK_TYPES].sort()).toEqual(['cta', 'faq', 'features', 'form', 'hero']);
  });

  it('hero tiene dos variantes y el tema elige la que toca', () => {
    expect(BLOCKS.filter((b) => b.type === 'hero').map((b) => b.variant)).toEqual(['a', 'b']);
    expect(resolveBlock('hero', undefined, 'a')?.variant).toBe('a');
    expect(resolveBlock('hero', undefined, 'b')?.variant).toBe('b');
    // Una variante explícita manda sobre el tema.
    expect(resolveBlock('hero', 'a', 'b')?.variant).toBe('a');
    expect(resolveBlock('hero', 'z', 'a')).toBeNull();
    expect(resolveBlock('faq', undefined, 'b')?.type).toBe('faq');
    expect(resolveBlock('carrusel', undefined, 'a')).toBeNull();
  });

  it('cada demoProps cumple su propio esquema', () => {
    for (const def of BLOCKS) {
      const r = def.propsSchema.safeParse(def.demoProps);
      expect(r.success, `${def.type}${def.variant ?? ''}: ${JSON.stringify(!r.success && r.error.issues)}`).toBe(true);
      expect(def.aiGuidelines.length).toBeGreaterThan(20);
    }
  });

  it('cada tipo tiene Block.astro y está en el mapa de RenderBlocks', () => {
    const render = readFileSync(here('../components/pages/RenderBlocks.astro'), 'utf8');
    for (const type of BLOCK_TYPES) {
      expect(existsSync(here(`./${type}/Block.astro`)), type).toBe(true);
      expect(render).toMatch(new RegExp(`^\\s+${type}: \\w+,$`, 'm'));
    }
  });

  it('las props no aceptan clases CSS', () => {
    for (const def of BLOCKS) {
      const r = def.propsSchema.safeParse({ ...(def.demoProps as object), class: 'bg-red-500' });
      expect(r.success, def.type).toBe(false);
    }
  });
});

describe('manifiesto /__blocks.json', () => {
  const manifest = buildManifest();

  it('forma del contrato: { slug, type, variant?, category, jsonSchema, demoProps }', () => {
    expect(manifest.map((m) => m.slug)).toEqual(['hero-a', 'hero-b', 'features', 'faq', 'cta', 'form']);
    expect(new Set(manifest.map((m) => m.type)).size).toBe(5);
    for (const m of manifest) {
      expect(Object.keys(m).sort()).toEqual(
        ['category', 'demoProps', 'jsonSchema', 'slug', 'type', ...(m.variant ? ['variant'] : [])].sort(),
      );
    }
  });

  it('jsonSchema presente, de objeto, con sus propiedades y serializable', () => {
    for (const m of manifest) {
      const s = m.jsonSchema as { type?: string; properties?: Record<string, unknown>; additionalProperties?: unknown };
      expect(s.type, m.slug).toBe('object');
      expect(Object.keys(s.properties ?? {}).length, m.slug).toBeGreaterThan(0);
      expect(s.additionalProperties, m.slug).toBe(false);
    }
    expect(() => JSON.parse(JSON.stringify(manifest))).not.toThrow();
    const faq = manifest.find((m) => m.slug === 'faq')!.jsonSchema as { required?: string[] };
    expect(faq.required).toEqual(expect.arrayContaining(['title', 'items']));
  });
});
