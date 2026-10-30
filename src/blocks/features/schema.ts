import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { columnasShape, estiloShape } from '../estilo';

// A MANO a propósito: se borra con el autoesquema de @saastro/studio 0.12.

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(160),
    description: z.string().max(300).optional(),
    items: z
      .array(
        z.object({
          /** Nombre de un icono de Tabler, sin el prefijo `tabler:`. */
          icon: z.string().regex(/^[a-z0-9-]{1,40}$/),
          title: z.string().min(1).max(80),
          description: z.string().min(1).max(300),
          tags: z.array(z.string().min(1).max(30)).max(6).optional(),
          /** Ocupa dos columnas. */
          wide: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(12),
    ...estiloShape,
    ...columnasShape,
  })
  .strict();

export type FeaturesProps = z.output<typeof propsSchema>;

const def: BlockDef<typeof propsSchema> = {
  type: 'features',
  component: 'FeatureGrid',
  category: 'content',
  propsSchema,
  demoProps: {
    eyebrow: 'Qué trae',
    title: 'Todo lo que necesita un site.',
    description: 'Sin plugins y sin sorpresas.',
    items: [
      { icon: 'bolt', title: 'Rápido', description: 'Astro sirviendo HTML desde el borde.' },
      { icon: 'pencil', title: 'Editable', description: 'El texto se cambia en Studio.', wide: true },
      { icon: 'shield-check', title: 'Seguro', description: 'Cabeceras y CSP de serie.', tags: ['CSP'] },
    ],
  },
  aiGuidelines: [
    'icon: nombre de Tabler en minúsculas con guiones (bolt, shield-check); si dudas, "circle".',
    'items: 4, 6 u 8 cuadran con 4 columnas; usa wide en como mucho uno.',
  ].join('\n'),
};

export default def;
