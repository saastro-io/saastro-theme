import { z } from 'zod';
import hero from './hero/schema';
import features from './features/schema';
import faq from './faq/schema';
import cta from './cta/schema';
import form from './form/schema';
import { blockSlug, type BlockDef } from './types';

/**
 * Registro de bloques de «páginas como datos». TS puro a propósito: lo leen el
 * manifiesto, la validación del documento y los tests. Los componentes
 * `.astro` los enlaza `src/components/pages/RenderBlocks.astro` por `type`.
 */
export const BLOCKS: readonly BlockDef[] = [...hero, ...features, ...faq, ...cta, ...form];

export const BLOCK_TYPES: readonly string[] = [...new Set(BLOCKS.map((b) => b.type))];

export type Tema = 'a' | 'b';
export const TEMAS: readonly Tema[] = ['a', 'b'];

/**
 * Variante de cada tipo según el tema del host. En los tipos que están aquí
 * MANDA EL TEMA, aunque el bloque traiga `variant` (p. ej. copiada de
 * `hero-a` del manifiesto): el mismo documento se viste según el host. En el
 * resto, `variant` elige entre las que haya.
 */
const VARIANTE_POR_TEMA: Record<string, Record<Tema, string>> = {
  hero: { a: 'a', b: 'b' },
};

export function resolveBlock(type: string, variant: string | undefined, tema: Tema): BlockDef | null {
  const candidates = BLOCKS.filter((b) => b.type === type);
  if (candidates.length === 0) return null;
  const porTema = VARIANTE_POR_TEMA[type]?.[tema];
  if (porTema) return candidates.find((b) => b.variant === porTema) ?? null;
  if (variant !== undefined) return candidates.find((b) => b.variant === variant) ?? null;
  return candidates.find((b) => b.variant === undefined) ?? candidates[0];
}

export interface ManifestEntry {
  slug: string;
  type: string;
  variant?: string;
  category: string;
  jsonSchema: unknown;
  demoProps: unknown;
}

/** El cuerpo de `GET /__blocks.json`. */
export function buildManifest(): ManifestEntry[] {
  return BLOCKS.map((def) => ({
    slug: blockSlug(def),
    type: def.type,
    ...(def.variant ? { variant: def.variant } : {}),
    category: def.category,
    // `io: 'input'`: lo que el Hub puede MANDAR (los `default` son opcionales).
    jsonSchema: z.toJSONSchema(def.propsSchema, { io: 'input' }),
    demoProps: def.demoProps,
  }));
}
