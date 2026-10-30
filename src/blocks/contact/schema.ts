import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { estiloShape } from '../estilo';

// A MANO a propósito: se borra con el autoesquema de @saastro/studio 0.12.
// El formulario NO es una prop: lo monta `RequestSite` con el HubForm del site
// (`forms.siteId` en settings.yaml). El idioma lo pone la ruta, no el documento.

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(160),
    description: z.string().max(400).optional(),
    points: z.array(z.string().min(1).max(120)).max(6).optional(),
    /** Se pinta en lugar del formulario si el site aún no está conectado al Hub. */
    notConnected: z.string().min(1).max(200),
    ...estiloShape,
  })
  .strict();

export type ContactProps = z.output<typeof propsSchema>;

const def: BlockDef<typeof propsSchema> = {
  type: 'contact',
  component: 'RequestSite',
  category: 'form',
  propsSchema,
  demoProps: {
    eyebrow: 'Contacto',
    title: 'Pide tu site.',
    description: 'Cuéntanos qué necesitas y te respondemos en un día laborable.',
    points: ['Sin compromiso', 'Respuesta en 24 h'],
    notConnected: 'El formulario aún no está conectado.',
  },
  aiGuidelines: [
    'points: ventajas de escribir, ≤ 4 y cortas.',
    'notConnected: frase neutra para cuando el formulario no está activo.',
  ].join('\n'),
};

export default def;
