/**
 * Restos de otro cliente en la plantilla.
 *
 * LocalBusinessJsonLd llevaba como fallback el nombre de un cliente real: un
 * site que cargara una dirección sin `meta.siteName` habría publicado ese
 * nombre en su JSON-LD. El fallback es ahora `resolveSiteName`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fuente = readFileSync(new URL('../components/LocalBusinessJsonLd.astro', import.meta.url), 'utf8');

describe('LocalBusinessJsonLd', () => {
  it('no lleva el nombre de un cliente como literal', () => {
    expect(fuente).not.toMatch(/yogui/i);
  });

  it('resuelve el nombre con resolveSiteName', () => {
    expect(fuente).toContain('resolveSiteName(Astro.locals)');
  });
});
