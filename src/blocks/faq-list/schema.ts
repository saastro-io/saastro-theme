import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { safeHref } from '../href';
import { estiloShape, estiloDemo } from '../estilo';

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(160),
    askPrefix: z.string().max(60).optional(),
    askLink: z.string().max(60).optional(),
    askHref: safeHref.optional(),
    items: z
      .array(z.object({ question: z.string().min(1).max(160), answer: z.string().min(1).max(800) }).strict())
      .min(1)
      .max(12),
    ...estiloShape,
  })
  .strict();

export type FaqListProps = z.output<typeof propsSchema>;

export const faqList: BlockDef<typeof propsSchema> = {
  type: 'faq-list',
  category: 'faq',
  propsSchema,
  demoProps: {
    eyebrow: 'Preguntas',
    title: 'Preguntas, respondidas.',
    askPrefix: '¿Otra duda?',
    askLink: 'Pregúntanos directamente.',
    askHref: '#contact',
    items: [{ question: '¿Qué es Saastro Theme?', answer: 'La base sobre la que construimos las webs de clientes.' }],
    ...estiloDemo,
  },
  aiGuidelines: ['items: 4-8 preguntas reales de cliente; answer ≤ 60 palabras, sin jerga.'].join('\n'),
};

export default [faqList];
