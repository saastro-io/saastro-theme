import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { estiloShape, columnasShape, estiloDemo } from '../estilo';

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(160),
    items: z
      .array(z.object({ title: z.string().min(1).max(60), description: z.string().min(1).max(300) }).strict())
      .min(1)
      .max(6),
    ...estiloShape,
    ...columnasShape,
  })
  .strict();

export type ProblemGridProps = z.output<typeof propsSchema>;

export const problemGrid: BlockDef<typeof propsSchema> = {
  type: 'problem-grid',
  category: 'content',
  propsSchema,
  demoProps: {
    eyebrow: 'El problema',
    title: 'Editable o bien hecha. Casi todas las webs te obligan a elegir.',
    items: [
      { title: 'Page builders', description: 'Fáciles de editar, pero tu web vive en la plataforma de otro.' },
      { title: 'Webs a medida', description: 'Rápidas, pero cada cambio de texto es un ticket.' },
      { title: 'El apaño', description: 'Un poco de cada, y lo peor de ambos.' },
    ],
    ...estiloDemo,
  },
  aiGuidelines: ['title: el problema en una frase.', 'items: 3 ideas paralelas; title ≤ 4 palabras, description 1 frase.'].join('\n'),
};

export default [problemGrid];
