import { z } from 'zod';
import type { BlockDef } from '../types';

export const propsSchema = z
  .object({
    title: z.string().min(1).max(120),
    items: z
      .array(z.object({ q: z.string().min(1).max(200), a: z.string().min(1).max(1200) }).strict())
      .min(1)
      .max(20),
  })
  .strict();

export type FaqProps = z.output<typeof propsSchema>;

export const faq: BlockDef<typeof propsSchema> = {
  type: 'faq',
  category: 'faq',
  propsSchema,
  demoProps: {
    title: 'Preguntas frecuentes',
    items: [
      { q: '¿Necesito desplegar para publicar?', a: 'No: el site lee el documento publicado del Hub en cada petición sin caché.' },
      { q: '¿Qué pasa si el Hub cae?', a: 'Se sirve la última copia buena con la cabecera x-saastro-stale.' },
    ],
  },
  aiGuidelines: [
    'q: pregunta real de un cliente, en su voz, con signos de interrogación.',
    'a: respuesta directa en 1–3 frases; nada de "¡Buena pregunta!".',
    '3–8 items.',
  ].join('\n'),
};

export default [faq];
