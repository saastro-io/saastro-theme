import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRegistry, flattenDefs } from '@saastro/studio/pages';
import { claseBloque, COLUMNAS_POR_TIPO, TONO, ALINEACION, ESPACIADO } from './estilo';

// Lo mismo que hace el módulo virtual `virtual:saastro-pages`: globea
// `src/blocks/*/schema.ts` y lo aplana. Un test aquí = lo que verá /__blocks.json.
const schemas = import.meta.glob('./*/schema.ts', { eager: true, import: 'default' });
const registry = createRegistry(flattenDefs(schemas as Record<string, unknown>));

const NUEVE = ['compare', 'contact', 'cta', 'faq', 'features', 'hero', 'problem', 'proof', 'steps'];
const raiz = fileURLToPath(new URL('.', import.meta.url));

describe('catálogo de la Home como bloques', () => {
  it('registra los nueve tipos de la Home', () => {
    expect([...registry.types].sort()).toEqual(NUEVE);
  });

  it('el manifiesto trae JSON Schema y demoProps de cada uno', () => {
    const manifest = registry.buildManifest();
    expect(manifest.map((m) => m.slug).sort()).toEqual(NUEVE);
    for (const m of manifest) {
      expect(m.jsonSchema, m.slug).toMatchObject({ type: 'object' });
      expect(m.demoProps, m.slug).toBeTruthy();
    }
  });

  it('cada bloque declara `component` (el que usa la Home) y llega al manifiesto', () => {
    const ESPERADO: Record<string, string> = {
      hero: 'HomeHero',
      proof: 'ProofStrip',
      problem: 'ProblemGrid',
      steps: 'HomeSteps',
      features: 'FeatureGrid',
      compare: 'CompareRows',
      faq: 'FaqList',
      contact: 'RequestSite',
      cta: 'FinalCta',
    };
    const manifest = registry.buildManifest() as unknown as Array<{ slug: string; component?: string }>;
    const real = Object.fromEntries(manifest.map((m) => [m.slug, m.component]));
    expect(real).toEqual(ESPERADO);
  });

  it('cada demoProps valida con su propio esquema', () => {
    for (const def of registry.blocks) {
      const r = def.propsSchema.safeParse(def.demoProps);
      expect(r.success, `${def.type}: ${JSON.stringify(r.error?.issues)}`).toBe(true);
    }
  });

  it('cada carpeta tiene su Block.astro (un type sin componente se omite en silencio)', () => {
    for (const tipo of NUEVE) {
      expect(existsSync(`${raiz}${tipo}/Block.astro`), tipo).toBe(true);
    }
    const carpetas = readdirSync(raiz, { withFileTypes: true }).filter((d) => d.isDirectory());
    expect(carpetas.map((d) => d.name).sort()).toEqual(NUEVE);
  });
});

describe('props de estilo comunes', () => {
  it('los nueve aceptan tono, alineacion y espaciado, y los defaults son claro/inicio/m', () => {
    for (const def of registry.blocks) {
      const base = def.propsSchema.parse(def.demoProps) as Record<string, unknown>;
      expect(base, def.type).toMatchObject({ tono: 'claro', alineacion: 'inicio', espaciado: 'm' });
      const r = def.propsSchema.safeParse({ ...(def.demoProps as object), tono: 'oscuro', alineacion: 'centro', espaciado: 'l' });
      expect(r.success, def.type).toBe(true);
    }
  });

  it('rechaza valores fuera del enum y cualquier prop libre (nada de clases en datos)', () => {
    for (const def of registry.blocks) {
      const demo = def.demoProps as object;
      expect(def.propsSchema.safeParse({ ...demo, tono: 'rojo' }).success, `${def.type} tono`).toBe(false);
      expect(def.propsSchema.safeParse({ ...demo, espaciado: 'xl' }).success, `${def.type} espaciado`).toBe(false);
      expect(def.propsSchema.safeParse({ ...demo, class: 'p-0' }).success, `${def.type} class`).toBe(false);
    }
  });

  it('columnas (2|3|4) solo en las rejillas', () => {
    const conColumnas = ['features', 'problem', 'proof', 'steps'];
    for (const def of registry.blocks) {
      const demo = def.demoProps as object;
      const r = def.propsSchema.safeParse({ ...demo, columnas: 3 });
      expect(r.success, def.type).toBe(conColumnas.includes(def.type));
      if (conColumnas.includes(def.type)) {
        expect(def.propsSchema.safeParse({ ...demo, columnas: 5 }).success, `${def.type} 5`).toBe(false);
      }
    }
    expect(Object.keys(COLUMNAS_POR_TIPO).sort()).toEqual(conColumnas);
  });

  it('claseBloque traduce a clases literales y cambia con cada enum', () => {
    expect(claseBloque('features', {})).toBe('ds-home');
    expect(claseBloque('features', { tono: 'oscuro' })).toContain('--ds-bg:');
    expect(claseBloque('features', { tono: 'marca' })).toContain('bg-primary/10');
    expect(claseBloque('features', { alineacion: 'centro' })).toContain('text-center');
    expect(claseBloque('features', { espaciado: 'l' })).toContain('py-24');
    expect(claseBloque('features', { espaciado: 's' })).toContain('py-8');
    expect(claseBloque('features', { columnas: 2 })).toContain('grid-cols-2');
    expect(claseBloque('features', { columnas: 4 })).toContain('grid-cols-4');
    // Un tipo sin rejilla ignora `columnas` en vez de inventar una clase.
    expect(claseBloque('hero', { columnas: 3 })).toBe('ds-home');
  });

  it('Tailwind ve las clases: global.css escanea src/blocks y estilo.ts no las construye', () => {
    const css = readFileSync(`${raiz}../styles/global.css`, 'utf8');
    expect(css).toMatch(/@source\s+"\.\.\/blocks\/\*\*\/\*\.\{astro,ts\}"/);
    // Una clase armada con plantilla (`grid-cols-${n}`) no se emite: cero `${` en las tablas.
    const todas = [...Object.values(TONO), ...Object.values(ALINEACION), ...Object.values(ESPACIADO)];
    for (const porTipo of Object.values(COLUMNAS_POR_TIPO)) todas.push(...Object.values(porTipo));
    for (const c of todas) expect(c).not.toContain('${');
  });
});
