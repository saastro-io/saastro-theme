/**
 * La cookie de consentimiento y el atributo `Secure`.
 *
 * Un navegador DESCARTA en silencio una cookie `Secure` que se escribe desde
 * una página http que no sea localhost (p. ej. `http://saastro.test:4321`): el
 * «Reject all» no sobrevivía a la recarga y el banner volvía a salir. Aquí se
 * fija la regla: `Secure` sobre https, nunca sobre http.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { consentRevoked, parseConsent, resolvePrefs, setConsent } from './cookies';

function escribirCon(protocol: string): string {
  const doc = { cookie: '' };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('location', { protocol });
  setConsent({ analytics: false, marketing: false, personalization: false });
  return doc.cookie;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('setConsent', () => {
  it('sobre http NO marca Secure (el navegador la tiraría)', () => {
    const cookie = escribirCon('http:');
    expect(cookie).not.toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('sobre https SÍ marca Secure', () => {
    expect(escribirCon('https:')).toMatch(/;\s*Secure$/);
  });

  it('lo escrito se vuelve a leer: «Reject all» queda en false/false', () => {
    const cookie = escribirCon('http:');
    const par = cookie.split(';')[0];
    expect(parseConsent(par)).toMatchObject({
      essential: true,
      analytics: false,
      personalization: false,
    });
  });
});

describe('categoría marketing', () => {
  it('se escribe y se vuelve a leer', () => {
    const doc = { cookie: '' };
    vi.stubGlobal('document', doc);
    vi.stubGlobal('location', { protocol: 'https:' });
    setConsent({ analytics: false, marketing: true, personalization: false });
    expect(parseConsent(doc.cookie.split(';')[0])).toMatchObject({ analytics: false, marketing: true });
  });

  it('una cookie anterior a la categoría se lee como marketing:false, nunca aceptada', () => {
    const vieja = encodeURIComponent(
      JSON.stringify({ essential: true, analytics: true, personalization: true, timestamp: 'x' }),
    );
    const c = parseConsent(`cookie_consent=${vieja}`);
    expect(c?.analytics).toBe(true);
    expect(c?.marketing).toBe(false);
  });

  it('un valor no booleano en marketing no cuenta como aceptado', () => {
    const raro = encodeURIComponent(JSON.stringify({ analytics: true, marketing: 'true' }));
    expect(parseConsent(`cookie_consent=${raro}`)?.marketing).toBe(false);
  });

  it('JSON que no es un objeto se descarta', () => {
    expect(parseConsent(`cookie_consent=${encodeURIComponent('null')}`)).toBeNull();
  });
});

describe('consentRevoked (cuándo hay que recargar)', () => {
  const on = { analytics: true, marketing: true };
  it('sin consentimiento previo no hay nada que revocar', () => {
    expect(consentRevoked(null, { analytics: false, marketing: false })).toBe(false);
  });
  it('retirar analytics revoca', () => {
    expect(consentRevoked(on, { analytics: false, marketing: true })).toBe(true);
  });
  it('retirar marketing revoca', () => {
    expect(consentRevoked(on, { analytics: true, marketing: false })).toBe(true);
  });
  it('conceder o mantener no revoca', () => {
    expect(consentRevoked({ analytics: false, marketing: false }, on)).toBe(false);
    expect(consentRevoked(on, on)).toBe(false);
  });
});

describe('resolvePrefs (lo que guarda cada botón)', () => {
  const todo = { analytics: true, marketing: true, personalization: true };
  it('sin la categoría a la vista, marketing NUNCA se guarda a true', () => {
    expect(resolvePrefs(todo, false).marketing).toBe(false);
  });
  it('con la categoría a la vista respeta lo elegido', () => {
    expect(resolvePrefs(todo, true).marketing).toBe(true);
    expect(resolvePrefs({ ...todo, marketing: false }, true).marketing).toBe(false);
  });
  it('un marketing ausente o no booleano cuenta como no', () => {
    expect(resolvePrefs({ analytics: true, personalization: true }, true).marketing).toBe(false);
  });
});
