import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { safeHref } from '../href';
import { estiloShape } from '../estilo';

// A MANO a propósito: se borra con el autoesquema de @saastro/studio 0.12.

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(160),
    askPrefix: z.string().max(120).optional(),
    askLink: z.string().max(60).optional(),
    askHref: safeHref.optional(),
    items: z
      .array(z.object({ question: z.string().min(1).max(160), answer: z.string().min(1).max(800) }))
      .min(1)
      .max(12),
    ...estiloShape,
  })
  .strict();

export type FaqProps = z.output<typeof propsSchema>;

const def: BlockDef<typeof propsSchema> = {
  type: 'faq',
  component: 'FaqList',
  category: 'faq',
  propsSchema,
  demoProps: {
    eyebrow: 'Preguntas',
    title: 'Lo que suelen preguntar.',
    askPrefix: '¿Otra duda?',
    askLink: 'Escríbenos',
    askHref: '#contact',
    items: [
      { question: '¿Puedo editar el texto yo?', answer: 'Sí, desde Studio y sin pedir un deploy.' },
      { question: '¿Quién mantiene el código?', answer: 'Vive en tu repositorio.' },
    ],
  },
  aiGuidelines: [
    'items: preguntas como las diría un cliente; respuesta de 1–3 frases, sin HTML.',
    'La primera pregunta sale abierta: pon la más importante primero.',
  ].join('\n'),
};

export default def;
