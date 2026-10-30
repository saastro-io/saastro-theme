import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { estiloShape, columnasShape, estiloDemo } from '../estilo';

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(160),
    description: z.string().max(300).optional(),
    items: z
      .array(
        z
          .object({
            /** Nombre de un icono de Tabler, sin prefijo (`pencil`, `world`…). */
            icon: z.string().regex(/^[a-z0-9-]{1,40}$/),
            title: z.string().min(1).max(60),
            description: z.string().min(1).max(300),
            tags: z.array(z.string().min(1).max(30)).max(4).optional(),
            wide: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    ...estiloShape,
    ...columnasShape,
  })
  .strict();

export type FeatureGridProps = z.output<typeof propsSchema>;

export const featureGrid: BlockDef<typeof propsSchema> = {
  type: 'feature-grid',
  category: 'content',
  propsSchema,
  demoProps: {
    eyebrow: 'Funciones',
    title: 'Lo que trae cada web.',
    description: 'Incluido en la base, no plugins que se añaden después.',
    items: [
      { icon: 'pencil', title: 'Se edita desde el Hub', description: 'Sin tocar código.', tags: ['Saastro Studio'], wide: true },
      { icon: 'world', title: 'Bilingüe de serie', description: 'Inglés y español.' },
    ],
    ...estiloDemo,
  },
  aiGuidelines: ['items: ≤ 8; icon es un nombre de Tabler en minúsculas; wide solo en 1 o 2.'].join('\n'),
};

export default [featureGrid];
