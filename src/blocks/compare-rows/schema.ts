import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { estiloShape, estiloDemo } from '../estilo';

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(160),
    labelUs: z.string().min(1).max(40),
    labelThem: z.string().min(1).max(40),
    /** La etiqueta corta que repite cada celda en móvil. */
    labelThemShort: z.string().min(1).max(24),
    rows: z
      .array(
        z
          .object({ label: z.string().min(1).max(40), us: z.string().min(1).max(200), them: z.string().min(1).max(200) })
          .strict(),
      )
      .min(1)
      .max(10),
    ...estiloShape,
  })
  .strict();

export type CompareRowsProps = z.output<typeof propsSchema>;

export const compareRows: BlockDef<typeof propsSchema> = {
  type: 'compare-rows',
  category: 'content',
  propsSchema,
  demoProps: {
    eyebrow: 'Comparativa',
    title: 'Saastro Theme frente a un page builder.',
    labelUs: 'Saastro Theme',
    labelThem: 'Page builder típico',
    labelThemShort: 'Page builder',
    rows: [{ label: 'Edición', us: 'Desde el Hub, con Saastro Studio', them: 'Editor visual dentro del builder' }],
    ...estiloDemo,
  },
  aiGuidelines: ['rows: 4-6 criterios; us y them ≤ 12 palabras, comparables entre sí.'].join('\n'),
};

export default [compareRows];
