import type { z } from 'zod';

/**
 * Lo que exporta el `schema.ts` de cada bloque. Es TS puro —sin `.astro`—
 * para que el manifiesto (`/__blocks.json`), la validación del documento y los
 * tests lo lean sin pasar por el compilador de Astro.
 *
 * Regla: las props NUNCA llevan clases CSS. Lo que cambia el aspecto es un enum
 * que el `Block.astro` traduce a clases LITERALES (Tailwind solo ve literales).
 */
export type BlockCategory = 'hero' | 'content' | 'faq' | 'cta' | 'form';

export interface BlockDef<S extends z.ZodType = z.ZodType> {
  type: string;
  /** Solo los tipos con más de una composición. */
  variant?: string;
  category: BlockCategory;
  propsSchema: S;
  demoProps: z.input<S>;
  /** Cómo debe rellenarlo una IA: una lista corta de reglas, en castellano. */
  aiGuidelines: string;
}

/** Slug estable del manifiesto: `hero-a`, `features`… */
export function blockSlug(def: Pick<BlockDef, 'type' | 'variant'>): string {
  return def.variant ? `${def.type}-${def.variant}` : def.type;
}
