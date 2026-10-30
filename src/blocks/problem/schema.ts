import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { columnasShape, estiloShape } from '../estilo';

// A MANO a propósito: se borra con el autoesquema de @saastro/studio 0.12.

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(160),
    items: z
      .array(z.object({ title: z.string().min(1).max(80), description: z.string().min(1).max(300) }))
      .min(1)
      .max(6),
    ...estiloShape,
    ...columnasShape,
  })
  .strict();

export type ProblemProps = z.output<typeof propsSchema>;

const def: BlockDef<typeof propsSchema> = {
  type: 'problem',
  category: 'content',
  propsSchema,
  demoProps: {
    eyebrow: 'El problema',
    title: 'Los sites a medida se quedan viejos.',
    items: [
      { title: 'Cambiar un texto cuesta un deploy', description: 'Hay que pedirlo y esperar.' },
      { title: 'Cada cambio rompe algo', description: 'Sin un contrato, nadie se atreve.' },
      { title: 'El diseño y el código divergen', description: 'A los tres meses no se parecen.' },
    ],
  },
  aiGuidelines: [
    'items: un problema por celda; title ≤ 8 palabras, description una frase.',
    'columnas: 3 por defecto; usa 2 si hay 2 o 4 problemas.',
  ].join('\n'),
};

export default def;
