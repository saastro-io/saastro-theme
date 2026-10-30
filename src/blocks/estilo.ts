/**
 * Props de estilo COMUNES de los bloques de «páginas como datos».
 *
 * Una prop de estilo es un enum, nunca una clase: `Block.astro` la traduce a
 * clases LITERALES con `claseBloque` (Tailwind solo ve literales; construir el
 * nombre con una plantilla las dejaría sin regla). Mismos nombres y valores en
 * los nueve bloques, para que el Hub pinte los mismos selectores.
 *
 * - tono:       claro | oscuro | marca   (superficie y tinta del bloque)
 * - alineacion: inicio | centro          (texto de la cabecera)
 * - espaciado:  s | m | l                (relleno vertical)
 * - columnas:   2 | 3 | 4                (solo en los bloques que son rejilla)
 */
import { z } from 'zod';

export const TONOS = ['claro', 'oscuro', 'marca'] as const;
export const ALINEACIONES = ['inicio', 'centro'] as const;
export const ESPACIADOS = ['s', 'm', 'l'] as const;
export const COLUMNAS = [2, 3, 4] as const;

export type Tono = (typeof TONOS)[number];
export type Alineacion = (typeof ALINEACIONES)[number];
export type Espaciado = (typeof ESPACIADOS)[number];
export type Columnas = (typeof COLUMNAS)[number];

/** Forma de las props de estilo; `columnas` solo la declaran las rejillas. */
export const estiloShape = {
  tono: z.enum(TONOS).default('claro'),
  alineacion: z.enum(ALINEACIONES).default('inicio'),
  espaciado: z.enum(ESPACIADOS).default('m'),
} as const;

export const columnasShape = {
  columnas: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
} as const;

export interface EstiloProps {
  tono?: Tono;
  alineacion?: Alineacion;
  espaciado?: Espaciado;
  columnas?: Columnas;
}

// Todo literal. Los tonos reescriben los tokens `--ds-*` del DS (home-ds.css)
// SOLO dentro del bloque; las secciones los leen con `var(--ds-*)`.
export const TONO: Record<Tono, string> = {
  claro: '',
  oscuro:
    'bg-[oklch(0.165_0.01_270)] text-[oklch(0.935_0.004_270)] ' +
    '[--ds-bg:oklch(0.165_0.01_270)] [--ds-bg-elevated:oklch(0.205_0.011_270)] ' +
    '[--ds-bg-sunken:oklch(0.14_0.009_270)] [--ds-fg:oklch(0.935_0.004_270)] ' +
    '[--ds-fg-muted:oklch(0.72_0.01_270)] [--ds-fg-subtle:oklch(0.59_0.012_270)] ' +
    '[--ds-fg-faint:oklch(0.46_0.012_270)] [--ds-border:oklch(0.29_0.013_270)] ' +
    '[--ds-border-strong:oklch(0.37_0.015_270)]',
  marca:
    'bg-primary/10 [--ds-bg-sunken:color-mix(in_oklab,var(--primary)_14%,transparent)] ' +
    '[--ds-bg-elevated:color-mix(in_oklab,var(--primary)_6%,white)]',
};

export const ALINEACION: Record<Alineacion, string> = {
  inicio: '',
  centro: 'text-center [&_.sec-head]:mx-auto [&_.sec-head]:justify-items-center',
};

// Relleno vertical de `.sec` (64px por defecto = m).
export const ESPACIADO: Record<Espaciado, string> = {
  s: '[&_.sec]:!py-8',
  m: '',
  l: '[&_.sec]:!py-24',
};

// Cada rejilla tiene su clase interna; el `md:` respeta el apilado móvil de
// la sección (su CSS móvil sigue mandando por debajo de 768px).
export const COLUMNAS_POR_TIPO: Record<string, Record<Columnas, string>> = {
  proof: {
    2: 'md:[&_.strip-in]:!grid-cols-2',
    3: 'md:[&_.strip-in]:!grid-cols-3',
    4: 'md:[&_.strip-in]:!grid-cols-4',
  },
  problem: {
    2: 'md:[&_.prob]:!grid-cols-2',
    3: 'md:[&_.prob]:!grid-cols-3',
    4: 'md:[&_.prob]:!grid-cols-4',
  },
  steps: {
    2: 'md:[&_.steps]:!grid-cols-2',
    3: 'md:[&_.steps]:!grid-cols-3',
    4: 'md:[&_.steps]:!grid-cols-4',
  },
  features: {
    2: 'md:[&_.feat]:!grid-cols-2',
    3: 'md:[&_.feat]:!grid-cols-3',
    4: 'md:[&_.feat]:!grid-cols-4',
  },
};

/** Clases del contenedor del bloque a partir de sus props de estilo. */
export function claseBloque(tipo: string, e: EstiloProps): string {
  const cols = e.columnas ? COLUMNAS_POR_TIPO[tipo]?.[e.columnas] : undefined;
  return [
    'ds-home',
    TONO[e.tono ?? 'claro'],
    ALINEACION[e.alineacion ?? 'inicio'],
    ESPACIADO[e.espaciado ?? 'm'],
    cols,
  ]
    .filter(Boolean)
    .join(' ');
}
