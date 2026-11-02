/**
 * Las alturas del Button del theme. `@saastro/forms` pasa `size` al Button
 * inyectado y espera md h-10 · lg h-12 · xl h-14: si alguien devuelve lg a h-9
 * (el valor viejo de shadcn), HubForm pierde el control SIZE sin que nada
 * falle en build. button.tsx viene del registry de saastro-ui y `pnpm ui:check`
 * lo vigila, así que la medida se fija aquí y no en el fichero.
 *
 * No hace falta navegador: `buttonVariants({ size })` devuelve la cadena de
 * clases y la altura es una clase `h-*` de esa cadena.
 */

import { describe, expect, it } from 'vitest';
import { buttonVariants } from '@/components/ui/button';

type Talla = NonNullable<Parameters<typeof buttonVariants>[0]>['size'];

const clases = (size: Talla) => buttonVariants({ size }).split(/\s+/);
const alturas = (size: Talla) => clases(size).filter((c) => /^h-/.test(c));

describe('Button: escala de @saastro/forms', () => {
  it.each([
    ['md', 'h-10'],
    ['lg', 'h-12'],
    ['xl', 'h-14'],
  ] as const)('size %s lleva exactamente %s', (size, h) => {
    expect(alturas(size)).toEqual([h]);
  });

  it('lg ya no es h-9 (el valor viejo)', () => {
    expect(clases('lg')).not.toContain('h-9');
  });

  it('las tallas propias no cambian: default h-8 · sm h-7 · xs h-6', () => {
    expect(alturas('default')).toEqual(['h-8']);
    expect(alturas('sm')).toEqual(['h-7']);
    expect(alturas('xs')).toEqual(['h-6']);
  });

  it('sin size, el Button es default (h-8) y no hereda md/lg/xl', () => {
    expect(buttonVariants().split(/\s+/).filter((c) => /^h-/.test(c))).toEqual(['h-8']);
  });
});
