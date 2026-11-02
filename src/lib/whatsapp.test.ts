/**
 * Número del widget de WhatsApp: variable de build > clave i18n; sin número válido el widget
 * no se monta. Fixtures falsos (34000000000), nunca un número real.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENV_WHATSAPP, normalizeWhatsAppNumber, resolveWhatsAppNumber } from './whatsapp';

describe('normalizeWhatsAppNumber', () => {
  it('acepta lo que se escribe a mano y devuelve solo dígitos', () => {
    expect(normalizeWhatsAppNumber('34000000000')).toBe('34000000000');
    expect(normalizeWhatsAppNumber('+34 000 000 000')).toBe('34000000000');
    expect(normalizeWhatsAppNumber('(34) 000-000.000')).toBe('34000000000');
    expect(normalizeWhatsAppNumber('  34000000000  ')).toBe('34000000000');
  });

  it.each(['', 'abc', '34000000000x', '3400000000?text=x', '34/000000000', '1234567', '1234567890123456', '++34000000000', '12 34a', null, undefined, 34000000000])(
    'rechaza %j',
    (v) => {
      expect(normalizeWhatsAppNumber(v)).toBeNull();
    },
  );
});

describe('resolveWhatsAppNumber', () => {
  it('sin variable y sin clave i18n: sin número (el widget no se monta)', () => {
    expect(resolveWhatsAppNumber(undefined, '')).toEqual({ number: '' });
    expect(resolveWhatsAppNumber('', undefined)).toEqual({ number: '' });
    expect(resolveWhatsAppNumber('   ', '  ')).toEqual({ number: '' });
  });

  it('la variable da el número aunque la clave i18n esté vacía', () => {
    expect(resolveWhatsAppNumber('34000000000', '')).toEqual({ number: '34000000000' });
  });

  it('la variable gana a la clave i18n', () => {
    expect(resolveWhatsAppNumber('34000000000', '34111111111').number).toBe('34000000000');
  });

  it('variable vacía = la clave i18n', () => {
    expect(resolveWhatsAppNumber('', '34111111111').number).toBe('34111111111');
    expect(resolveWhatsAppNumber(undefined, '+34 111 111 111').number).toBe('34111111111');
  });

  it('variable inválida: se descarta con aviso, NO cae a la clave i18n y el widget no se monta', () => {
    const r = resolveWhatsAppNumber('hola', '34111111111');
    expect(r.number).toBe('');
    expect(r.warning).toContain(ENV_WHATSAPP);
  });

  it('variable que no es cadena: inválida', () => {
    expect(resolveWhatsAppNumber(34000000000, '34111111111').number).toBe('');
  });

  it('clave i18n inválida: sin número y con aviso', () => {
    const r = resolveWhatsAppNumber(undefined, 'llámanos');
    expect(r.number).toBe('');
    expect(r.warning).toContain('whatsapp.number');
  });

  it('el número es lo que acaba en wa.me: solo dígitos', () => {
    expect(resolveWhatsAppNumber('+34 000 000 000', '').number).toMatch(/^\d+$/);
  });
});

describe('el layout monta el widget solo con número', () => {
  const layout = readFileSync(fileURLToPath(new URL('../layouts/SiteLayout.astro', import.meta.url)), 'utf8');

  it('la condición de montaje es el número ya resuelto (no la clave i18n cruda)', () => {
    expect(layout).toContain('whatsapp.number &&');
    expect(layout).not.toMatch(/t\?\.whatsapp\?\.number &&/);
  });

  it('el número viene de PUBLIC_WHATSAPP_NUMBER y de t.whatsapp.number', () => {
    expect(layout).toContain('resolveWhatsAppNumber(import.meta.env.PUBLIC_WHATSAPP_NUMBER, t?.whatsapp?.number)');
  });

  it('el widget recibe el número normalizado', () => {
    expect(layout).toContain('number: whatsapp.number');
  });
});
