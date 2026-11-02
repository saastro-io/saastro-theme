/**
 * Al retirar el consentimiento se borran las cookies de los proveedores. Lo difícil
 * no es borrar `_ga`, es borrarla DONDE está: GA la escribe en el dominio raíz
 * (`.saastro.io`) y un `document.cookie = '_ga=; expires=…'` sin `domain` no la
 * toca. Aquí hay un bote de cookies falso que respeta dominio y ruta, así que un
 * borrado que no acierte con el dominio deja la cookie y el test se pone rojo.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import catalogo from './tracking-providers.json';
import {
  aplicarLimpiezaPendiente,
  clearTrackerCookies,
  CLAVE_LIMPIEZA,
  domainCandidates,
  marcarLimpiezaPendiente,
  matchesRule,
  rulesFor,
} from './tracker-cookies';
import { revokedCategories } from './cookies';

interface Galleta {
  name: string;
  value: string;
  domain: string | null; // null = host-only
  path: string;
}

function bote(inicial: Array<[string, string | null]>, hostname: string) {
  const galletas: Galleta[] = inicial.map(([name, domain]) => ({ name, value: '1', domain, path: '/' }));
  const document = {
    get cookie() {
      return galletas.map((g) => `${g.name}=${g.value}`).join('; ');
    },
    set cookie(v: string) {
      const [par, ...attrs] = v.split(';').map((s) => s.trim());
      const [name, value] = [par.split('=')[0], par.split('=').slice(1).join('=')];
      const a = Object.fromEntries(attrs.map((x) => x.split('=')).map(([k, ...r]) => [k.toLowerCase(), r.join('=')]));
      const path = a.path ?? '/';
      const domain = a.domain ?? null;
      const caducada = a.expires !== undefined && new Date(a.expires).getTime() < Date.now();
      const i = galletas.findIndex((g) => g.name === name && g.path === path && g.domain === domain);
      if (caducada) {
        if (i >= 0) galletas.splice(i, 1);
        return;
      }
      if (i >= 0) galletas[i].value = value;
      else galletas.push({ name, value, domain, path });
    },
  };
  return { document, location: { hostname }, nombres: () => galletas.map((g) => g.name).sort() };
}

describe('domainCandidates', () => {
  it('prueba el host y el dominio registrable, nunca el TLD suelto', () => {
    expect(domainCandidates('theme.saastro.io')).toEqual(['theme.saastro.io', 'saastro.io']);
    expect(domainCandidates('a.b.c.co')).toEqual(['a.b.c.co', 'b.c.co', 'c.co']);
    expect(domainCandidates('jcenlo.com')).toEqual(['jcenlo.com']);
  });
  it('localhost, IP y vacío no llevan atributo domain', () => {
    expect(domainCandidates('localhost')).toEqual([]);
    expect(domainCandidates('127.0.0.1')).toEqual([]);
    expect(domainCandidates('::1')).toEqual([]);
    expect(domainCandidates('')).toEqual([]);
  });
});

describe('rulesFor / matchesRule', () => {
  it('analytics incluye las medidas en Chrome (_ga, _ga_<id>, _clck, _clsk) y no las de anuncios', () => {
    const r = rulesFor(['analytics']);
    for (const n of ['_ga', '_ga_TESTAAAA01', '_clck', '_clsk']) expect(matchesRule(n, r), n).toBe(true);
    for (const n of ['_fbp', '_gcl_au', 'cookie_consent', 'foo']) expect(matchesRule(n, r), n).toBe(false);
  });
  it('marketing incluye anuncios y no analítica', () => {
    const r = rulesFor(['marketing']);
    for (const n of ['_fbp', '_fbc', '_gcl_au', '_ttp']) expect(matchesRule(n, r), n).toBe(true);
    for (const n of ['_ga', '_clck', 'cookie_consent']) expect(matchesRule(n, r), n).toBe(false);
  });
  it('un nombre que solo CONTIENE el prefijo no cuenta (`my_ga_x`)', () => {
    expect(matchesRule('my_ga_x', rulesFor(['analytics']))).toBe(false);
  });
});

describe('clearTrackerCookies', () => {
  it('en theme.saastro.io borra las del dominio raíz y respeta lo ajeno y el consentimiento', () => {
    const env = bote(
      [
        ['_ga', 'saastro.io'],
        ['_ga_TESTAAAA01', 'saastro.io'],
        ['_clck', 'saastro.io'],
        ['_clsk', 'saastro.io'],
        ['cookie_consent', null],
        ['_fbp', null],
        ['foo', null],
      ],
      'theme.saastro.io',
    );
    const borradas = clearTrackerCookies(['analytics'], env);
    expect(borradas.sort()).toEqual(['_clck', '_clsk', '_ga', '_ga_TESTAAAA01']);
    expect(env.nombres()).toEqual(['_fbp', 'cookie_consent', 'foo']);
  });

  it('en localhost (host-only) también funciona', () => {
    const env = bote([['_ga', null], ['_clck', null], ['cookie_consent', null]], 'localhost');
    clearTrackerCookies(['analytics'], env);
    expect(env.nombres()).toEqual(['cookie_consent']);
  });

  it('retirar SOLO marketing no toca la analítica', () => {
    const env = bote([['_fbp', null], ['_gcl_au', 'jcenlo.com'], ['_ga', 'jcenlo.com']], 'jcenlo.com');
    clearTrackerCookies(['marketing'], env);
    expect(env.nombres()).toEqual(['_ga']);
  });

  it('nunca borra cookie_consent, ni retirándolo todo', () => {
    const env = bote([['cookie_consent', null], ['_ga', null], ['_fbp', null]], 'localhost');
    clearTrackerCookies(['analytics', 'marketing'], env);
    expect(env.nombres()).toEqual(['cookie_consent']);
  });

  it('sin cookies de proveedor no escribe nada', () => {
    const env = bote([['foo', null]], 'localhost');
    expect(clearTrackerCookies(['analytics'], env)).toEqual([]);
    expect(env.nombres()).toEqual(['foo']);
  });
});

function almacen(inicial?: string) {
  const m = new Map<string, string>(inicial ? [[CLAVE_LIMPIEZA, inicial]] : []);
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    tiene: () => m.has(CLAVE_LIMPIEZA),
  };
}

describe('limpieza pendiente tras la recarga (el script vivo reescribe su cookie)', () => {
  it('REGRESIÓN medida: una cookie reescrita entre el borrado y la recarga se borra al cargar la página nueva', () => {
    const env = bote([['_ga', 'saastro.io'], ['_ga_TESTAAAA01', 'saastro.io'], ['cookie_consent', null]], 'theme.saastro.io');
    const a = almacen();
    clearTrackerCookies(['analytics'], env); // borrado inmediato en save()
    marcarLimpiezaPendiente(['analytics'], a);
    env.document.cookie = '_ga_TESTAAAA01=GS2.1.nueva; path=/; domain=saastro.io'; // GA la reescribe antes de recargar
    expect(env.nombres()).toContain('_ga_TESTAAAA01');
    expect(aplicarLimpiezaPendiente(env, a)).toEqual(['_ga_TESTAAAA01']); // ya en la página nueva
    expect(env.nombres()).toEqual(['cookie_consent']);
  });
  it('la marca se consume: una segunda carga no borra nada', () => {
    const env = bote([['_ga', null]], 'localhost');
    const a = almacen();
    marcarLimpiezaPendiente(['analytics'], a);
    aplicarLimpiezaPendiente(env, a);
    expect(a.tiene()).toBe(false);
    env.document.cookie = '_ga=nueva; path=/'; // p. ej. tras volver a aceptar
    expect(aplicarLimpiezaPendiente(env, a)).toEqual([]);
    expect(env.nombres()).toEqual(['_ga']);
  });
  it('sin marca no hace nada', () => {
    const env = bote([['_ga', null]], 'localhost');
    expect(aplicarLimpiezaPendiente(env, almacen())).toEqual([]);
    expect(env.nombres()).toEqual(['_ga']);
  });
  it('una marca corrupta o con categorías raras no borra ni lanza', () => {
    const env = bote([['_ga', null], ['_fbp', null]], 'localhost');
    expect(aplicarLimpiezaPendiente(env, almacen('no es json'))).toEqual([]);
    expect(aplicarLimpiezaPendiente(env, almacen('{"a":1}'))).toEqual([]);
    expect(aplicarLimpiezaPendiente(env, almacen('["essential","todo"]'))).toEqual([]);
    expect(env.nombres()).toEqual(['_fbp', '_ga']);
  });
  it('con el almacenamiento bloqueado no lanza', () => {
    const roto = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => {} };
    expect(() => marcarLimpiezaPendiente(['analytics'], roto)).not.toThrow();
    expect(aplicarLimpiezaPendiente(bote([], 'localhost'), roto)).toEqual([]);
  });
});

describe('revokedCategories', () => {
  const on = { analytics: true, marketing: true };
  it('solo las que pasan de concedidas a retiradas', () => {
    expect(revokedCategories(on, { analytics: false, marketing: true })).toEqual(['analytics']);
    expect(revokedCategories(on, { analytics: true, marketing: false })).toEqual(['marketing']);
    expect(revokedCategories(on, { analytics: false, marketing: false })).toEqual(['analytics', 'marketing']);
  });
  it('conceder, mantener o no tener consentimiento previo no revoca nada', () => {
    expect(revokedCategories(null, { analytics: false, marketing: false })).toEqual([]);
    expect(revokedCategories({ analytics: false, marketing: false }, on)).toEqual([]);
    expect(revokedCategories(on, on)).toEqual([]);
  });
});

describe('catálogo y banner', () => {
  it('todo proveedor del catálogo declara sus cookies (aunque sea vacío)', () => {
    for (const p of catalogo.providers) {
      expect(Array.isArray((p as { cookies?: { exact: string[]; prefix: string[] } }).cookies?.exact), p.key).toBe(true);
      expect(Array.isArray((p as { cookies?: { exact: string[]; prefix: string[] } }).cookies?.prefix), p.key).toBe(true);
    }
  });
  it('CookieBanner borra las cookies de lo retirado ANTES de recargar', () => {
    const b = readFileSync(new URL('../widgets/CookieConsent/CookieBanner.tsx', import.meta.url), 'utf8');
    const iBorrar = b.indexOf('clearTrackerCookies(retiradas)');
    const iRecargar = b.indexOf('window.location.reload()');
    expect(iBorrar).toBeGreaterThan(-1);
    expect(iBorrar).toBeLessThan(iRecargar);
  });
  it('CookieBanner deja la marca antes de recargar y aplica la pendiente al montar', () => {
    const b = readFileSync(new URL('../widgets/CookieConsent/CookieBanner.tsx', import.meta.url), 'utf8');
    expect(b.indexOf('marcarLimpiezaPendiente(retiradas)')).toBeGreaterThan(-1);
    expect(b.indexOf('marcarLimpiezaPendiente(retiradas)')).toBeLessThan(b.indexOf('window.location.reload()'));
    expect(b).toMatch(/useEffect\(\(\) => \{\s*\/\/[^\n]*\n\s*aplicarLimpiezaPendiente\(\)/);
  });
});
