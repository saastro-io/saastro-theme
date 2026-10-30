import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { columnasShape, estiloShape } from '../estilo';

// A MANO a propósito: se borra con el autoesquema de @saastro/studio 0.12.

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(160),
    steps: z
      .array(z.object({ title: z.string().min(1).max(80), description: z.string().min(1).max(300) }))
      .min(1)
      .max(6),
    ...estiloShape,
    ...columnasShape,
  })
  .strict();

export type StepsProps = z.output<typeof propsSchema>;

const def: BlockDef<typeof propsSchema> = {
  type: 'steps',
  category: 'content',
  propsSchema,
  demoProps: {
    eyebrow: 'Cómo funciona',
    title: 'De la idea al site en tres pasos.',
    steps: [
      { title: 'Cuéntanos', description: 'Un brief corto y una conversación.' },
      { title: 'Diseñamos', description: 'Un diseño que se porta a código.' },
      { title: 'Publicas', description: 'Editas y publicas sin esperar a nadie.' },
    ],
  },
  aiGuidelines: [
    'steps: el número sale de la posición, no lo escribas en el título.',
    'Cada paso: título imperativo corto y una frase.',
  ].join('\n'),
};

export default def;
