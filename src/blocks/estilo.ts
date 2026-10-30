import { z } from 'zod';

/**
 * PASO 0 de «páginas como datos»: las props de estilo COMUNES a todos los
 * bloques. Nunca clases CSS: son enums, y `Envoltura.astro` las traduce a
 * `data-*` que `src/styles/bloques.css` convierte en CSS literal.
 *
 * - `tono`:       claro | oscuro | marca
 * - `alineacion`: inicio | centro
 * - `espaciado`:  s | m | l   (relleno vertical de la sección)
 * - `columnas`:   2 | 3 | 4   (solo los bloques con rejilla)
 *
 * Nav, footer y lo global los pone el layout del site: no son bloques.
 *
 * Los `schema.ts` de `src/blocks/*` son A MANO y desechables: el autoesquema
 * (studio 0.12) los sustituirá leyendo las `Props` de cada sección.
 */
export const estiloShape = {
  tono: z.enum(['claro', 'oscuro', 'marca']).default('claro'),
  alineacion: z.enum(['inicio', 'centro']).default('inicio'),
  espaciado: z.enum(['s', 'm', 'l']).default('m'),
} as const;

export const columnasShape = {
  columnas: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
} as const;

export const estiloDemo = { tono: 'claro', alineacion: 'inicio', espaciado: 'm' } as const;
