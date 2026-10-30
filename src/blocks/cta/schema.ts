import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { safeHref } from '../href';
import { estiloShape } from '../estilo';

// A MANO a propósito: se borra con el autoesquema de @saastro/studio 0.12.

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(160),
    code: z.string().max(120).optional(),
    primaryCta: z.string().min(1).max(40),
    primaryHref: safeHref,
    secondaryCta: z.string().max(40).optional(),
    secondaryHref: safeHref.optional(),
    ...estiloShape,
  })
  .strict();

export type CtaProps = z.output<typeof propsSchema>;

const def: BlockDef<typeof propsSchema> = {
  type: 'cta',
  category: 'cta',
  propsSchema,
  demoProps: {
    eyebrow: 'Empieza hoy',
    title: 'Tu site, listo para editar.',
    code: 'pnpm scaffold client',
    primaryCta: 'Pedir mi site',
    primaryHref: '#contact',
    secondaryCta: 'Ver bloques',
    secondaryHref: 'https://ui.saastro.io',
  },
  aiGuidelines: [
    'title: una sola idea, imperativa o de beneficio.',
    'code: opcional, un comando corto; si no hay, déjalo fuera.',
    'primaryHref: ancla (#contact) o ruta del site.',
  ].join('\n'),
};

export default def;
