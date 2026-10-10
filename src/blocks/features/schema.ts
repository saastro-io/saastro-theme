import { z } from 'zod';
import type { BlockDef } from '../types';

/** Mismo set de iconos que `src/components/blocks/features-01.astro`. */
export const ICON_NAMES = ['zap', 'shield', 'code', 'sparkles', 'globe', 'lock'] as const;

export const propsSchema = z
  .object({
    title: z.string().max(120).optional(),
    description: z.string().max(400).optional(),
    items: z
      .array(
        z
          .object({
            icon: z.enum(ICON_NAMES).optional(),
            title: z.string().min(1).max(80),
            description: z.string().min(1).max(300),
          })
          .strict(),
      )
      .min(1)
      .max(9),
    columns: z.enum(['2', '3']).default('3'),
  })
  .strict();

export type FeaturesProps = z.output<typeof propsSchema>;

export const features: BlockDef<typeof propsSchema> = {
  type: 'features',
  category: 'content',
  propsSchema,
  demoProps: {
    title: 'Qué cambia',
    description: 'Tres ideas del prototipo.',
    items: [
      { icon: 'zap', title: 'Datos, no código', description: 'Una página nueva es un documento del Hub.' },
      { icon: 'shield', title: 'Validado en el borde', description: 'Un bloque que no cumple su esquema no se pinta.' },
      { icon: 'globe', title: 'Temas por host', description: 'El mismo documento se viste distinto según el dominio.' },
    ],
  },
  aiGuidelines: [
    'items: 3, 6 o 9 para que la rejilla cierre.',
    'title de cada item: 2–5 palabras; description: una frase.',
    `icon: uno de ${ICON_NAMES.join(', ')}, u omítelo en todos.`,
  ].join('\n'),
};

export default [features];
