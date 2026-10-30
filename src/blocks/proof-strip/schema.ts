import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { estiloShape, estiloDemo } from '../estilo';

export const propsSchema = z
  .object({
    items: z
      .array(z.object({ label: z.string().min(1).max(30), value: z.string().min(1).max(60) }).strict())
      .min(1)
      .max(8),
    ...estiloShape,
  })
  .strict();

export type ProofStripProps = z.output<typeof propsSchema>;

export const proofStrip: BlockDef<typeof propsSchema> = {
  type: 'proof-strip',
  category: 'content',
  propsSchema,
  demoProps: {
    items: [
      { label: 'Framework', value: 'Astro + islas de React' },
      { label: 'Runtime', value: 'Cloudflare Workers' },
    ],
    ...estiloDemo,
  },
  aiGuidelines: ['items: datos de prueba cortos; label ≤ 2 palabras, value ≤ 6.'].join('\n'),
};

export default [proofStrip];
