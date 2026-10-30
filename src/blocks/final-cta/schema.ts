import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { safeHref } from '../href';
import { estiloShape, estiloDemo } from '../estilo';

const link = z.object({ label: z.string().min(1).max(40), href: safeHref }).strict();

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(160),
    code: z.string().max(120).optional(),
    primaryCta: link,
    secondaryCta: link.optional(),
    ...estiloShape,
  })
  .strict();

export type FinalCtaProps = z.output<typeof propsSchema>;

export const finalCta: BlockDef<typeof propsSchema> = {
  type: 'final-cta',
  category: 'cta',
  propsSchema,
  demoProps: {
    eyebrow: 'Saastro Theme',
    title: 'Tu web. Tu repo. Tu equipo editándola.',
    code: '$ git clone',
    primaryCta: { label: 'Solicita tu web', href: '#contact' },
    ...estiloDemo,
  },
  aiGuidelines: ['title: cierre en una frase; primaryCta.label: verbo en imperativo, ≤ 3 palabras.'].join('\n'),
};

export default [finalCta];
