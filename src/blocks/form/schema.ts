import { z } from 'zod';
import type { BlockDef } from '../types';

export const propsSchema = z
  .object({
    title: z.string().max(120).optional(),
    description: z.string().max(400).optional(),
    /** Slug del formulario del Hub (lo pinta `<HubForm>` vía LandingForm). */
    formSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    note: z.string().max(300).optional(),
  })
  .strict();

export type FormProps = z.output<typeof propsSchema>;

export const form: BlockDef<typeof propsSchema> = {
  type: 'form',
  category: 'form',
  propsSchema,
  demoProps: {
    title: 'Cuéntanos tu caso',
    description: 'Te respondemos en un día laborable.',
    formSlug: 'contacto',
  },
  aiGuidelines: [
    'formSlug: el slug EXACTO de un formulario publicado en el Hub; no lo inventes.',
    'title: corto y concreto; description: qué pasa después de enviar.',
  ].join('\n'),
};

export default [form];
