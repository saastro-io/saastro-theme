/**
 * La cookie de consentimiento y el atributo `Secure`.
 *
 * Un navegador DESCARTA en silencio una cookie `Secure` que se escribe desde
 * una página http que no sea localhost (p. ej. `http://saastro.test:4321`): el
 * «Reject all» no sobrevivía a la recarga y el banner volvía a salir. Aquí se
 * fija la regla: `Secure` sobre https, nunca sobre http.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseConsent, setConsent } from './cookies';

function escribirCon(protocol: string): string {
  const doc = { cookie: '' };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('location', { protocol });
  setConsent({ analytics: false, personalization: false });
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
