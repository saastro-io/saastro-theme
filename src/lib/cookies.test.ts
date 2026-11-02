/**
 * La cookie de consentimiento y el atributo `Secure`.
 *
 * Un navegador DESCARTA en silencio una cookie `Secure` que se escribe desde
 * una página http que no sea localhost (p. ej. `http://saastro.test:4321`): el
 * «Reject all» no sobrevivía a la recarga y el banner volvía a salir. Aquí se
 * fija la regla: `Secure` sobre https, nunca sobre http.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { bannerAlMontar, consentCovers, consentRevoked, parseConsent, resolvePrefs, setConsent } from './cookies';

function escribirCon(protocol: string): string {
  const doc = { cookie: '' };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('location', { protocol });
  setConsent({ analytics: false, marketing: false, personalization: false }, []);
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
    setConsent({ analytics: false, marketing: true, personalization: false }, []);
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

describe('consentCovers (versión del consentimiento por proveedor)', () => {
  it('sin consentimiento nunca cubre', () => {
    expect(consentCovers(null, [])).toBe(false);
    expect(consentCovers(undefined, ['ga4'])).toBe(false);
  });
  it('sin proveedores encendidos cualquier consentimiento vale, con o sin `providers`', () => {
    expect(consentCovers({}, [])).toBe(true);
    expect(consentCovers({ providers: [] }, [])).toBe(true);
  });
  it('cookie anterior (sin `providers`) con algún proveedor encendido NO vale', () => {
    expect(consentCovers({}, ['ga4'])).toBe(false);
  });
  it('`providers` que no es lista cuenta como ausente', () => {
    expect(consentCovers({ providers: 'ga4' }, ['ga4'])).toBe(false);
    expect(consentCovers({ providers: null }, ['ga4'])).toBe(false);
  });
  it('vale solo si TODO proveedor encendido ahora está guardado', () => {
    expect(consentCovers({ providers: ['ga4', 'clarity'] }, ['ga4', 'clarity'])).toBe(true);
    expect(consentCovers({ providers: ['ga4'] }, ['ga4', 'clarity'])).toBe(false);
    expect(consentCovers({ providers: [] }, ['clarity'])).toBe(false);
  });
  it('apagar un proveedor no invalida lo guardado', () => {
    expect(consentCovers({ providers: ['ga4', 'clarity'] }, ['ga4'])).toBe(true);
  });
});

describe('providers en la cookie', () => {
  function guardar(providers: string[]): string {
    const doc = { cookie: '' };
    vi.stubGlobal('document', doc);
    vi.stubGlobal('location', { protocol: 'https:' });
    setConsent({ analytics: true, marketing: false, personalization: false }, providers);
    return doc.cookie.split(';')[0];
  }
  it('setConsent guarda los proveedores (sin duplicados, ordenados) y parseConsent los devuelve', () => {
    const c = parseConsent(guardar(['clarity', 'ga4', 'clarity']));
    expect(c?.providers).toEqual(['clarity', 'ga4']);
  });
  it('lista vacía se conserva como vacía (consintió sin proveedores), no como ausente', () => {
    expect(parseConsent(guardar([]))?.providers).toEqual([]);
  });
  it('una cookie sin `providers` o con basura se lee SIN providers', () => {
    const ck = (o: object) => 'cookie_consent=' + encodeURIComponent(JSON.stringify(o));
    expect(parseConsent(ck({ analytics: true }))).not.toHaveProperty('providers');
    expect(parseConsent(ck({ analytics: true, providers: 'ga4' }))).not.toHaveProperty('providers');
  });
});

describe('bannerAlMontar', () => {
  const base = { essential: true as const, analytics: true, marketing: false, personalization: true, timestamp: 't' };
  it('sin cookie: visible y sin espejo', () => {
    expect(bannerAlMontar(null, ['ga4'])).toEqual({ visible: true, mirrorAnalytics: null, prefill: null });
  });
  it('consentimiento que cubre: oculto y el espejo sigue la elección', () => {
    const r = bannerAlMontar({ ...base, providers: ['ga4'] }, ['ga4']);
    expect(r.visible).toBe(false);
    expect(r.mirrorAnalytics).toBe(true);
  });
  it('consentimiento que NO cubre: visible, elección precargada y el espejo se RETIRA (no sigue concediendo)', () => {
    const r = bannerAlMontar({ ...base, providers: ['ga4'] }, ['ga4', 'clarity']);
    expect(r.visible).toBe(true);
    expect(r.mirrorAnalytics).toBe('retirar');
    expect(r.prefill).toEqual({ analytics: true, marketing: false, personalization: true });
  });
  it('cookie antigua sin providers con proveedor encendido: visible; sin proveedor: oculto', () => {
    expect(bannerAlMontar(base, ['ga4']).visible).toBe(true);
    expect(bannerAlMontar(base, []).visible).toBe(false);
  });
});
