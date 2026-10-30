import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { estiloShape, estiloDemo } from '../estilo';

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(160),
    description: z.string().max(300).optional(),
    points: z.array(z.string().min(1).max(120)).max(6).optional(),
    /** Texto si el site no tiene el formulario conectado al Hub. */
    notConnected: z.string().min(1).max(200),
    ...estiloShape,
  })
  .strict();

export type RequestSiteProps = z.output<typeof propsSchema>;

export const requestSite: BlockDef<typeof propsSchema> = {
  type: 'request-site',
  category: 'form',
  propsSchema,
  demoProps: {
    eyebrow: 'Contacto',
    title: 'Solicita tu web.',
    description: 'Cuéntanos sobre tu negocio y la web que necesitas.',
    points: ['Tu equipo la edita desde el Hub', 'El repo es tuyo'],
    notConnected: 'El formulario aún no está conectado. Vuelve a intentarlo pronto.',
    ...estiloDemo,
  },
  aiGuidelines: ['points: ≤ 4 razones para escribir, ≤ 10 palabras cada una.', 'El formulario es el del site; no se elige aquí.'].join('\n'),
};

export default [requestSite];
