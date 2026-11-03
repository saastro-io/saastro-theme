import { describe, expect, it } from 'vitest';
import { lpContact } from '../src/lib/lp-contact';

describe('lpContact', () => {
  it('vacío o ausente = null', () => {
    expect(lpContact(undefined)).toBeNull();
    expect(lpContact({ phone: '', email: '  ' })).toBeNull();
  });
  it('teléfono: href tel limpio, conserva el +', () => {
    expect(lpContact({ phone: '+34 600 11 22 33' })?.phone).toEqual({
      label: '+34 600 11 22 33',
      href: 'tel:+34600112233',
    });
  });
  it('descarta lo inválido (no pinta enlaces rotos ni inyecta)', () => {
    expect(lpContact({ phone: 'javascript:alert(1)' })).toBeNull();
    expect(lpContact({ phone: '123' })).toBeNull();
    expect(lpContact({ email: 'no-es-email' })).toBeNull();
    expect(lpContact({ email: 'a@b.es?subject=x" onclick="y' })).toBeNull();
  });
  it('email válido', () => {
    expect(lpContact({ email: 'hola@ejemplo.es' })?.email?.href).toBe('mailto:hola@ejemplo.es');
  });
});
