import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { estiloShape, estiloDemo } from '../estilo';

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(160),
    steps: z
      .array(z.object({ title: z.string().min(1).max(60), description: z.string().min(1).max(300) }).strict())
      .min(1)
      .max(6),
    ...estiloShape,
  })
  .strict();

export type HomeStepsProps = z.output<typeof propsSchema>;

export const homeSteps: BlockDef<typeof propsSchema> = {
  type: 'home-steps',
  category: 'content',
  propsSchema,
  demoProps: {
    eyebrow: 'Cómo funciona · 3 pasos',
    title: 'Del brief a una web que lleva tu equipo.',
    steps: [
      { title: 'Construimos tu web', description: 'La montamos sobre Saastro Theme.' },
      { title: 'Se publica', description: 'En Cloudflare Workers.' },
      { title: 'Tu equipo la edita', description: 'Desde el Hub, sin tocar código.' },
    ],
    ...estiloDemo,
  },
  aiGuidelines: ['steps: en orden cronológico, 3-4 pasos; title en infinitivo o 3.ª persona, ≤ 5 palabras.'].join('\n'),
};

export default [homeSteps];
