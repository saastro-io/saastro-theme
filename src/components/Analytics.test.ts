/**
 * Ejecuta el script REAL de Analytics.astro (extraído de su fuente, no una copia)
 * contra un DOM simulado. Es lo único que prueba el orden de Consent Mode y qué
 * carga con cada consentimiento; sin esto, un refactor del inline pasa todos los
 * tests y rompe el consentimiento en producción.
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const fuente = readFileSync(new URL('./Analytics.astro', import.meta.url), 'utf8');
const CODIGO = fuente.match(/<script is:inline[^>]*>([\s\S]*?)<\/script>/)![1];

function ejecutar(cookie: string, ids = { gaId: 'G-TEST123456', gtmId: 'GTM-TEST123' }) {
  const scripts: string[] = [];
  const oyentes: Record<string, (e: unknown) => void> = {};
  const doc = {
    cookie,
    readyState: 'complete',
    head: { appendChild: (s: { src: string }) => scripts.push(s.src) },
    getElementsByTagName: () => [{ parentNode: { insertBefore: (s: { src: string }) => scripts.push(s.src) } }],
    createElement: () => ({}),
    addEventListener: () => {},
  };
  const win: Record<string, unknown> = { document: doc, addEventListener: (n: string, f: (e: unknown) => void) => { oyentes[n] = f; } };
  win.window = win;
  runInNewContext(CODIGO, { ...ids, window: win, document: doc, encodeURIComponent, decodeURIComponent, JSON, Date, Array });
  const dl = (win.dataLayer as IArguments[]).map((a) => Array.from(a));
  return { scripts, dl, win, evento: (d: unknown) => oyentes['cookie-consent-updated']({ detail: d }) };
}
const ck = (o: object) => 'cookie_consent=' + encodeURIComponent(JSON.stringify(o));

describe('Analytics.astro (script inline real)', () => {
  it('lo primero que entra en el dataLayer es consent default con TODO denied', () => {
    const { dl } = ejecutar('');
    expect(dl[0].slice(0, 2)).toEqual(['consent', 'default']);
    expect(dl[0][2]).toMatchObject({ analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  });

  it('sin cookie o con todo rechazado no carga NINGÚN script de Google', () => {
    expect(ejecutar('').scripts).toEqual([]);
    expect(ejecutar(ck({ analytics: false, marketing: false })).scripts).toEqual([]);
  });

  it('con analytics carga GA4 y GTM; marketing queda denegado', () => {
    const r = ejecutar(ck({ analytics: true, personalization: true })); // cookie vieja, sin marketing
    expect(r.scripts.some((s) => s.includes('gtag/js?id=G-TEST123456'))).toBe(true);
    expect(r.scripts.some((s) => s.includes('gtm.js?id=GTM-TEST123'))).toBe(true);
    const upd = r.dl.find((a) => a[0] === 'consent' && a[1] === 'update')![2];
    expect(upd).toMatchObject({ analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied' });
  });

  it('solo marketing carga GTM, NO GA4', () => {
    const r = ejecutar(ck({ analytics: false, marketing: true }));
    expect(r.scripts).toHaveLength(1);
    expect(r.scripts[0]).toContain('gtm.js');
    const upd = r.dl.find((a) => a[0] === 'consent' && a[1] === 'update')![2];
    expect(upd).toMatchObject({ analytics_storage: 'denied', ad_storage: 'granted', ad_personalization: 'granted' });
  });

  it('aceptar después (evento) carga lo que toca, una sola vez', () => {
    const r = ejecutar('');
    r.evento({ analytics: false, marketing: true });
    r.evento({ analytics: false, marketing: true });
    expect(r.scripts.filter((s) => s.includes('gtm.js'))).toHaveLength(1);
  });

  it('un evento con valores no booleanos no concede nada', () => {
    const r = ejecutar('');
    r.evento({ analytics: 'true', marketing: 1 });
    expect(r.scripts).toEqual([]);
  });

  it('con solo GA4 configurado, marketing no carga nada', () => {
    const r = ejecutar(ck({ analytics: false, marketing: true }), { gaId: 'G-TEST123456', gtmId: '' });
    expect(r.scripts).toEqual([]);
  });
});
