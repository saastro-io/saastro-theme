import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * El tema b tiene que verse distinto A PRIMERA VISTA con la misma rev: fondo,
 * acento, primario y titular. Compara los tokens de `:root` (tema a, global.css)
 * con los de `[data-tema='b']` (temas.css).
 */
const leer = (f: string) => fs.readFileSync(new URL(`../../styles/${f}`, import.meta.url), 'utf8');
const bloque = (css: string, selector: string) => {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) throw new Error(`no está ${selector}`);
  return css.slice(i, css.indexOf('}', i));
};
const tokens = (bloqueCss: string) =>
  Object.fromEntries([...bloqueCss.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const oklch = (v: string) => {
  const m = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(v);
  if (!m) throw new Error(`no es oklch: ${v}`);
  return { l: Number(m[1]), c: Number(m[2]), h: Number(m[3]) };
};
/** Distancia en OKLab (≈ ΔE): 0,02 es un matiz; > 0,08 se ve sin buscarlo. */
const distancia = (x: string, y: string) => {
  const a = oklch(x);
  const b = oklch(y);
  const ab = (o: { l: number; c: number; h: number }) => [o.l, o.c * Math.cos((o.h * Math.PI) / 180), o.c * Math.sin((o.h * Math.PI) / 180)];
  const [p, q] = [ab(a), ab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

const temasCss = leer('temas.css');
const A = tokens(bloque(leer('global.css'), ':root'));
const B = tokens(bloque(temasCss, "[data-tema='b']"));

describe('tema b frente a tema a', () => {
  it.each(['--background', '--accent', '--primary'])('%s cambia de forma evidente (ΔOKLab > 0,08)', (t) => {
    expect(B[t], `${t} no está en el tema b`).toBeDefined();
    expect(distancia(A[t], B[t])).toBeGreaterThan(0.08);
  });

  it('el acento y el fondo de b tienen color (croma), no son grises', () => {
    expect(oklch(B['--accent']).c).toBeGreaterThan(0.1);
    expect(oklch(B['--background']).c).toBeGreaterThan(0.03);
  });

  it('el titular cambia de familia y de escala', () => {
    expect(B['--font-display']).toMatch(/Space Mono/);
    expect(B['--font-display']).not.toBe(A['--font-display']);
    expect(bloque(temasCss, "[data-tema='b'] h1")).toMatch(/font-size:\s*clamp\(/);
    expect(temasCss).toMatch(/\[data-tema='b'\] h2\s*\{[^}]*text-transform:\s*uppercase/);
  });
});
