import { z } from 'zod';
import type { BlockDef } from '../types';

const cta = z.object({
  label: z.string().min(1).max(40),
  href: z.string().min(1).max(500),
});

/**
 * Hero: UNAS props para las dos composiciones. Así un documento no cambia
 * cuando cambia el tema del host: el registro elige `a` o `b` y las mismas
 * props pintan cualquiera de las dos (src/blocks/registry.ts).
 */
export const propsSchema = z
  .object({
    eyebrow: z.string().max(60).optional(),
    title: z.array(z.string().min(1).max(80)).min(1).max(3),
    subtitle: z.string().min(1).max(400),
    image: z.url({ protocol: /^https$/ }).optional(),
    imageAlt: z.string().max(200).default(''),
    primaryCta: cta.optional(),
    secondaryCta: cta.optional(),
    stats: z
      .array(z.object({ value: z.string().min(1).max(20), label: z.string().min(1).max(60) }))
      .max(4)
      .default([]),
    /** Alineación del texto. Enum, nunca una clase. */
    align: z.enum(['start', 'center']).default('start'),
  })
  .strict();

export type HeroProps = z.output<typeof propsSchema>;

const demoProps: z.input<typeof propsSchema> = {
  eyebrow: 'Nuevo',
  title: ['Páginas que se', 'escriben como datos'],
  subtitle:
    'Cada bloque es un esquema: el Hub lo rellena, el site lo valida y lo pinta en el borde.',
  primaryCta: { label: 'Empezar', href: '#form' },
  secondaryCta: { label: 'Ver bloques', href: '/__blocks.json' },
  stats: [
    { value: '5', label: 'bloques' },
    { value: '2', label: 'temas' },
  ],
};

const aiGuidelines = [
  'title: 1–3 líneas cortas; cada línea es una idea, sin punto final.',
  'subtitle: una frase de beneficio, ≤ 200 caracteres.',
  'stats: solo cifras verificables; si no las hay, déjalo vacío.',
  'primaryCta.href: ancla interna (#form) o ruta del site; nada de URLs de terceros.',
].join('\n');

export const heroA: BlockDef<typeof propsSchema> = {
  type: 'hero',
  variant: 'a',
  category: 'hero',
  propsSchema,
  demoProps,
  aiGuidelines,
};

export const heroB: BlockDef<typeof propsSchema> = {
  type: 'hero',
  variant: 'b',
  category: 'hero',
  propsSchema,
  demoProps: { ...demoProps, align: 'center' },
  aiGuidelines: `${aiGuidelines}\nVariante b: composición partida; brilla con imagen o con 2–4 stats.`,
};

export default [heroA, heroB];
