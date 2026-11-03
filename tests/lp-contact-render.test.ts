import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Vitest de este repo no compila `.astro` (sin el plugin de Astro), así que el
// contrato del montaje se comprueba sobre el fuente: es lo que impide que el
// contacto vuelva a esconderse en <noscript> o se desmonte de la ruta.
const leer = (r: string) => readFileSync(new URL(r, import.meta.url), 'utf8');

describe('contacto visible en /lp/**', () => {
  const ruta = leer('../src/pages/[...locale]/lp/[slug].astro');
  const comp = leer('../src/components/lp/LandingContact.astro');

  it('la ruta monta LandingContact con los ajustes del site, fuera de cualquier <noscript>', () => {
    expect(ruta).toMatch(/<LandingContact contact=\{getSettings\(\)\.contact\} locale=\{locale\} \/>/);
    expect(ruta).not.toMatch(/<noscript/i);
  });

  it('el componente pinta un <aside> normal con los enlaces calculados por lpContact, sin <noscript>', () => {
    expect(comp).toContain('lpContact(contact)');
    expect(comp).toContain('<aside');
    expect(comp).toContain('data-lp-contact');
    expect(comp).not.toMatch(/<noscript/i);
  });

  it('gracias.astro queda fuera a propósito: el formulario ya se envió', () => {
    expect(leer('../src/pages/[...locale]/lp/gracias.astro')).not.toContain('LandingContact');
  });
});
