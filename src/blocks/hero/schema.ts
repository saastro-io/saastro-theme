import { z } from 'zod';
import type { BlockDef } from '@saastro/studio/pages';
import { safeHref } from '../href';
import { estiloShape } from '../estilo';

// A MANO a propósito: se borra cuando el autoesquema de @saastro/studio 0.12
// lea las `Props` de `src/components/home/HomeHero.astro`.

const mock = z
  .object({
    url: z.string().max(80),
    badge: z.string().max(40),
    brand: z.string().max(40),
    nav: z.array(z.string().max(30)).max(6),
    sectionTag: z.string().max(40),
    panelTitle: z.string().max(60),
    headingLabel: z.string().max(40),
    subheadingLabel: z.string().max(40),
    imageLabel: z.string().max(40),
    imagePlaceholder: z.string().max(60),
    replace: z.string().max(30),
    unpublished: z.string().max(40),
    publish: z.string().max(30),
    published: z.string().max(30),
    samples: z
      .array(
        z.object({
          lang: z.string().max(4),
          heading: z.string().max(120),
          subheading: z.string().max(200),
        }),
      )
      .min(1)
      .max(4),
  })
  .strict();

export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.string().min(1).max(120),
    titleMuted: z.string().max(120).optional(),
    subtitle: z.string().min(1).max(400),
    primaryCta: z.string().min(1).max(40),
    primaryHref: safeHref,
    secondaryCta: z.string().max(40).optional(),
    secondaryHref: safeHref.optional(),
    mockNote: z.string().max(160).optional(),
    /** La maqueta interactiva de Studio. Sin ella, el hero no pinta marco. */
    mock: mock.optional(),
    ...estiloShape,
  })
  .strict();

export type HeroProps = z.output<typeof propsSchema>;

const def: BlockDef<typeof propsSchema> = {
  type: 'hero',
  category: 'hero',
  propsSchema,
  demoProps: {
    eyebrow: 'Nuevo',
    title: 'Un site a medida,',
    titleMuted: 'editable desde el primer día.',
    subtitle: 'Diseño, código y un editor visual: tú cambias el texto, nosotros mantenemos el site.',
    primaryCta: 'Pedir mi site',
    primaryHref: '#contact',
    secondaryCta: 'Ver bloques',
    secondaryHref: 'https://ui.saastro.io',
  },
  aiGuidelines: [
    'title + titleMuted: el titular en dos mitades; la segunda sale apagada. Sin punto final.',
    'subtitle: una frase de beneficio, ≤ 200 caracteres.',
    'primaryHref: ancla interna (#contact) o ruta del site; nada de URLs de terceros.',
    'mock: déjalo fuera salvo que copies el de otro hero; es una maqueta, no contenido.',
  ].join('\n'),
};

export default def;
