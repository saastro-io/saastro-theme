import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { estiloShape } from '../estilo';

// A MANO a propósito: se borra con el autoesquema de @saastro/studio 0.12.

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(160),
    labelUs: z.string().min(1).max(40),
    labelThem: z.string().min(1).max(60),
    /** La etiqueta corta que repite cada celda en móvil. */
    labelThemShort: z.string().min(1).max(30),
    rows: z
      .array(
        z.object({
          label: z.string().min(1).max(60),
          us: z.string().min(1).max(120),
          them: z.string().min(1).max(120),
        }),
      )
      .min(1)
      .max(12),
    ...estiloShape,
  })
  .strict();

export type CompareProps = z.output<typeof propsSchema>;

const def: BlockDef<typeof propsSchema> = {
  type: 'compare',
  component: 'CompareRows',
  category: 'content',
  propsSchema,
  demoProps: {
    eyebrow: 'Comparativa',
    title: 'Contra un page builder típico.',
    labelUs: 'Saastro Theme',
    labelThem: 'Un page builder típico',
    labelThemShort: 'Builder',
    rows: [
      { label: 'Código', us: 'Tuyo, en Git', them: 'Del proveedor' },
      { label: 'Cambios', us: 'Sin build', them: 'Dependen del plan' },
    ],
  },
  aiGuidelines: [
    'rows: una fila por criterio; us siempre positivo y verificable, them neutro.',
    'labelThemShort: ≤ 12 caracteres.',
  ].join('\n'),
};

export default def;
