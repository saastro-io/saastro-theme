import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { safeHref } from '../href';
import { estiloShape, estiloDemo } from '../estilo';

const link = z.object({ label: z.string().min(1).max(40), href: safeHref }).strict();

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(140),
    titleMuted: z.string().max(140).optional(),
    subtitle: z.string().min(1).max(400),
    primaryCta: link,
    secondaryCta: link.optional(),
    ...estiloShape,
  })
  .strict();

export type HomeHeroProps = z.output<typeof propsSchema>;

export const homeHero: BlockDef<typeof propsSchema> = {
  type: 'home-hero',
  category: 'hero',
  propsSchema,
  demoProps: {
    eyebrow: 'Saastro Theme',
    title: 'Una web rápida que tu equipo puede editar.',
    titleMuted: 'Sin page builder.',
    subtitle: 'Astro, islas de React y Tailwind 4 en Cloudflare Workers.',
    primaryCta: { label: 'Solicita tu web', href: '#contact' },
    ...estiloDemo,
  },
  aiGuidelines: [
    'title: la promesa, ≤ 12 palabras; titleMuted: la matización, ≤ 6.',
    'subtitle: 1-2 frases con el cómo.',
    'primaryCta.label: verbo en imperativo, ≤ 3 palabras.',
  ].join('\n'),
};

export default [homeHero];
