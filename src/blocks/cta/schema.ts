import { z } from 'zod';
import type { BlockDef } from '../types';
import { safeHref } from '../href';

const link = z.object({ label: z.string().min(1).max(40), href: safeHref }).strict();

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(140),
    description: z.string().max(400).optional(),
    primaryCta: link,
    secondaryCta: link.optional(),
    notes: z.array(z.string().min(1).max(60)).max(4).default([]),
    /** Superficie del banner. Enum, nunca una clase. */
    tone: z.enum(['plain', 'primary']).default('plain'),
  })
  .strict();

export type CtaProps = z.output<typeof propsSchema>;

export const cta: BlockDef<typeof propsSchema> = {
  type: 'cta',
  category: 'cta',
  propsSchema,
  demoProps: {
    title: '¿Lo probamos en tu site?',
    description: 'Un documento, cinco bloques y dos temas.',
    primaryCta: { label: 'Hablemos', href: '#form' },
    notes: ['Sin despliegue', 'Reversible'],
    tone: 'primary',
  },
  aiGuidelines: [
    'title: una pregunta o una orden, ≤ 10 palabras.',
    'primaryCta.label: verbo en imperativo, ≤ 3 palabras.',
    'notes: objeciones que despeja (≤ 4 palabras cada una).',
  ].join('\n'),
};

export default [cta];
