/**
 * GenTracking: lo que el beacon hace —y no hace— según el banner de cookies.
 *
 * Se ejecuta el script REAL de `GenTracking.astro` (extraído del fichero, no una
 * copia) dentro de un `vm` con un navegador mínimo simulado. Un test contra una
 * réplica del script pasaría aunque el componente estuviera roto.
 *
 * El banner decide así (CookieBanner.tsx): escribe la cookie `cookie_consent`,
 * refleja `analytics` en localStorage['gen-consent'] (gen-consent.ts) y avisa
 * con `gen:consent-granted` (al conceder) y `cookie-consent-updated` (siempre).
 */

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const FUENTE = readFileSync(new URL('../components/GenTracking.astro', import.meta.url), 'utf8');
const SCRIPT = /<script[^>]*>([\s\S]*?)<\/script>/.exec(FUENTE)![1]!;

type Oyente = () => void;

const COOKIE_SI =
  'cookie_consent=' + encodeURIComponent('{"essential":true,"analytics":true,"personalization":false}');
const COOKIE_NO =
  'cookie_consent=' + encodeURIComponent('{"essential":true,"analytics":false,"personalization":false}');

function navegador(opts: {
  consent: 'none' | 'required' | undefined;
  cookie?: string;
  genConsent?: 'granted';
  host?: string;
}) {
  const sesion = new Map<string, string>();
  const local = new Map<string, string>();
  if (opts.genConsent) local.set('gen-consent', opts.genConsent);
  const envios: unknown[] = [];
  const oyentes: Record<string, Oyente[]> = {};
  const inputs: { name: string; value: string; remove: () => void }[] = [];
  const formulario = {
    querySelector: (sel: string) => (sel.includes('gen_visitor_id') ? (inputs[0] ?? null) : null),
    appendChild: (i: (typeof inputs)[number]) => inputs.push(i),
  };
  const doc: Record<string, unknown> = {
    cookie: opts.cookie ?? '',
    readyState: 'complete',
    referrer: '',
    title: 't',
    currentScript: {
      dataset: {
        genWorkspace: 'ws-1',
        genVertical: 'default',
        genEndpoint: 'https://gen.saastro.test',
        genOwnHost: '',
        genKeys: '[]',
        ...(opts.consent ? { genConsent: opts.consent } : {}),
      },
    },
    getElementsByTagName: () => [formulario],
    createElement: () => {
      const i = { name: '', value: '', type: '', remove: () => inputs.splice(inputs.indexOf(i), 1) };
      return i;
    },
    querySelectorAll: () => [...inputs],
    addEventListener: (n: string, f: Oyente) => (oyentes[n] ||= []).push(f),
  };
  const almacen = (m: Map<string, string>) => ({
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });
  const ctx = {
    document: doc,
    window: { addEventListener: (n: string, f: Oyente) => (oyentes[n] ||= []).push(f) },
    location: {
      hostname: opts.host ?? 'cliente.example',
      href: 'https://cliente.example/',
      pathname: '/',
      search: '',
    },
    sessionStorage: almacen(sesion),
    localStorage: almacen(local),
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000000' },
    navigator: { sendBeacon: (_u: string, b: unknown) => (envios.push(b), true) },
    Blob: class {
      constructor(public parts: unknown[]) {}
    },
    URLSearchParams, JSON, Date, Math, Object, decodeURIComponent, String,
    fetch: () => Promise.resolve(),
  };
  runInNewContext(SCRIPT, ctx);
  return {
    envios, sesion, local, inputs, doc,
    emitir: (n: string) => (oyentes[n] ?? []).forEach((f) => f()),
    /** Lo que hace el banner al ACEPTAR analítica. */
    aceptar() {
      doc.cookie = COOKIE_SI;
      local.set('gen-consent', 'granted');
      this.emitir('gen:consent-granted');
      this.emitir('cookie-consent-updated');
    },
    /** Lo que hace el banner al RECHAZAR / REVOCAR analítica. */
    rechazar() {
      doc.cookie = COOKIE_NO;
      local.delete('gen-consent');
      this.emitir('cookie-consent-updated');
    },
  };
}

describe('GenTracking · antes de que el visitante decida', () => {
  it('por defecto (consent ausente) no guarda id, ni inyecta campo, ni envía', () => {
    const n = navegador({ consent: undefined });
    expect(n.envios).toHaveLength(0);
    expect(n.sesion.size).toBe(0);
    expect(n.inputs).toHaveLength(0);
  });
  it('con «required» y sin consentimiento, igual', () => {
    const n = navegador({ consent: 'required' });
    expect(n.envios).toHaveLength(0);
    expect(n.sesion.size).toBe(0);
  });
  it('un gen-consent suelto sin cookie que lo respalde no vale', () => {
    const n = navegador({ consent: 'required', genConsent: 'granted' });
    expect(n.envios).toHaveLength(0);
    expect(n.sesion.size).toBe(0);
  });
  it('rechazar (analytics:false) no deja nada', () => {
    const n = navegador({ consent: 'required', cookie: COOKIE_NO });
    expect(n.envios).toHaveLength(0);
    expect(n.sesion.size).toBe(0);
  });
});

describe('GenTracking · tras decidir', () => {
  it('con consentimiento envía, guarda el id y rellena el formulario', () => {
    const n = navegador({ consent: 'required', cookie: COOKIE_SI, genConsent: 'granted' });
    expect(n.envios).toHaveLength(1);
    expect(n.sesion.get('gen-visitor-id')).toBeTruthy();
    expect(n.inputs[0]?.name).toBe('gen_visitor_id');
  });
  it('aceptar después empieza a medir en la misma página, y una sola vez', () => {
    const n = navegador({ consent: 'required' });
    expect(n.envios).toHaveLength(0);
    n.aceptar();
    expect(n.envios).toHaveLength(1);
  });
  it('revocar borra el id y el campo oculto', () => {
    const n = navegador({ consent: 'required', cookie: COOKIE_SI, genConsent: 'granted' });
    expect(n.sesion.size).toBe(1);
    expect(n.inputs).toHaveLength(1);
    n.rechazar();
    expect(n.sesion.size).toBe(0);
    expect(n.inputs).toHaveLength(0);
  });
  it('«none» explícito sigue midiendo sin banner', () => {
    const n = navegador({ consent: 'none' });
    expect(n.envios).toHaveLength(1);
  });
  it('el bloqueo de hosts de preview sigue mandando', () => {
    const n = navegador({ consent: 'none', host: 'x.saastro.io' });
    expect(n.envios).toHaveLength(0);
  });
});
