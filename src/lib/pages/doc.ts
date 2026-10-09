import { z } from 'zod';
import { resolveBlock, type Tema } from '../../blocks/registry';

/**
 * El documento de página del contrato con el Hub:
 * `{ v:1, siteId, locale, slug, rev, seo:{title,description}, blocks:[{ id, type, variant?, props }] }`.
 *
 * Aquí se valida la FORMA del documento; las props de cada bloque las valida
 * después su propio esquema (`validateBlocks`), para que un bloque malo se
 * omita sin tirar la página entera.
 */
export const blockRefSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  type: z.string().min(1).max(40),
  variant: z.string().min(1).max(20).optional(),
  props: z.record(z.string(), z.unknown()),
});

export const pageDocSchema = z.object({
  v: z.literal(1),
  siteId: z.string().min(1),
  locale: z.string().min(2).max(10),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
  rev: z.union([z.number().int().nonnegative(), z.string().min(1).max(64)]),
  seo: z.object({ title: z.string(), description: z.string() }),
  // Cada bloque se valida APARTE (`validateBlocks`): uno con mala forma se
  // omite y se cuenta; no tumba la página entera.
  blocks: z.array(z.unknown()),
});

export type BlockRef = z.infer<typeof blockRefSchema>;
export type PageDoc = z.infer<typeof pageDocSchema>;

export interface ValidBlock {
  id: string;
  type: string;
  variant?: string;
  props: Record<string, unknown>;
}

export interface BlockIssue {
  id: string;
  type: string;
  reason: 'forma-invalida' | 'tipo-desconocido' | 'props-invalidas' | 'id-repetido';
  issues?: z.core.$ZodIssue[];
}

/** Valida un bloque con el esquema de su tipo (y la variante que le toca por tema). */
export function validateBlock(
  block: BlockRef,
  tema: Tema,
): { ok: true; block: ValidBlock } | { ok: false; issue: BlockIssue } {
  const def = resolveBlock(block.type, block.variant, tema);
  if (!def) return { ok: false, issue: { id: block.id, type: block.type, reason: 'tipo-desconocido' } };
  const parsed = def.propsSchema.safeParse(block.props);
  if (!parsed.success) {
    return {
      ok: false,
      issue: { id: block.id, type: block.type, reason: 'props-invalidas', issues: parsed.error.issues },
    };
  }
  return {
    ok: true,
    block: { id: block.id, type: def.type, variant: def.variant, props: parsed.data as Record<string, unknown> },
  };
}

/** Los bloques que se pintan y los que se omiten (con por qué). Ids repetidos: gana el primero. */
export function validateBlocks(blocks: unknown[], tema: Tema): { valid: ValidBlock[]; skipped: BlockIssue[] } {
  const valid: ValidBlock[] = [];
  const skipped: BlockIssue[] = [];
  const seen = new Set<string>();
  for (const raw of blocks) {
    const ref = blockRefSchema.safeParse(raw);
    if (!ref.success) {
      const r = (raw ?? {}) as { id?: unknown; type?: unknown };
      skipped.push({ id: String(r.id ?? '?'), type: String(r.type ?? '?'), reason: 'forma-invalida', issues: ref.error.issues });
      continue;
    }
    const b = ref.data;
    if (seen.has(b.id)) {
      skipped.push({ id: b.id, type: b.type, reason: 'id-repetido' });
      continue;
    }
    seen.add(b.id);
    const r = validateBlock(b, tema);
    if (r.ok) valid.push(r.block);
    else skipped.push(r.issue);
  }
  return { valid, skipped };
}

/** Tag de caché de una página publicada. */
export const pageTag = (siteId: string, locale: string, slug: string) => `pg:${siteId}:${locale}:${slug}`;
