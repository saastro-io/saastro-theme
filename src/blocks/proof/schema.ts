import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { columnasShape, estiloShape } from '../estilo';

// A MANO a propósito: se borra con el autoesquema de @saastro/studio 0.12.

export const propsSchema = z
  .object({
    items: z
      .array(z.object({ label: z.string().min(1).max(40), value: z.string().min(1).max(60) }))
      .min(1)
      .max(6),
    ...estiloShape,
    ...columnasShape,
  })
  .strict();

export type ProofProps = z.output<typeof propsSchema>;

const def: BlockDef<typeof propsSchema> = {
  type: 'proof',
  component: 'ProofStrip',
  category: 'content',
  propsSchema,
  demoProps: {
    items: [
      { label: 'Stack', value: 'Astro 6' },
      { label: 'Editor', value: 'Studio' },
      { label: 'Hosting', value: 'Cloudflare' },
    ],
  },
  aiGuidelines: [
    'items: pares etiqueta/valor cortos (≤ 3 palabras el valor); 3 o 6 encajan mejor.',
    'Solo datos verificables; sin superlativos.',
  ].join('\n'),
};

export default def;
