/**
 * Ejecuta el script REAL de Analytics.astro (extraído de su fuente, no una copia)
 * contra un DOM simulado. Es lo único que prueba el orden de Consent Mode, qué
 * carga con cada consentimiento y a quién llega un evento de conversión; sin
 * esto, un refactor del inline pasa todos los tests y rompe el consentimiento en
 * producción.
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const fuente = readFileSync(new URL('./Analytics.astro', import.meta.url), 'utf8');
const CODIGO = fuente.match(/<script is:inline[^>]*>([\s\S]*?)<\/script>/)![1];

type P = { key: string; id: string; category: 'analytics' | 'marketing' | 'any' };
const GA4: P = { key: 'ga4', id: 'G-TEST123456', category: 'analytics' };
const GTM: P = { key: 'gtm', id: 'GTM-TEST123', category: 'any' };
const ADS: P = { key: 'googleAds', id: 'AW-123456789', category: 'marketing' };
const META: P = { key: 'metaPixel', id: '1234567890123', category: 'marketing' };
const TIKTOK: P = { key: 'tiktokPixel', id: 'ABCDEFGHIJ12345', category: 'marketing' };
const LINKEDIN: P = { key: 'linkedinPartnerId', id: '1234567', category: 'marketing' };
const CLARITY: P = { key: 'clarity', id: 'abcdefgh12', category: 'analytics' };
const TODOS = [GA4, GTM, ADS, META, TIKTOK, LINKEDIN, CLARITY];

function ejecutar(cookie: string, providers: P[], adsLabel = '') {
  const scripts: string[] = [];
  const oyentes: Record<string, (e: unknown) => void> = {};
  const insert = (s: { src: string }) => scripts.push(s.src);
  const doc = {
    cookie,
    readyState: 'complete',
    head: { appendChild: insert },
    getElementsByTagName: () => [{ parentNode: { insertBefore: insert } }],
    createElement: () => ({}),
    addEventListener: () => {},
  };
  const win: Record<string, unknown> = {
    document: doc,
    addEventListener: (n: string, f: (e: unknown) => void) => { oyentes[n] = f; },
  };
  win.window = win;
  runInNewContext(CODIGO, { providers, adsLabel, window: win, document: doc, encodeURIComponent, decodeURIComponent, JSON, Date, Array, Object });
  // gtag empuja objetos `arguments` (→ array); GTM empuja objetos planos (se dejan tal cual).
  const dl = () =>
    (win.dataLayer as any[]).map((a) => (Object.prototype.toString.call(a) === '[object Arguments]' ? Array.from(a) : a));
  return {
    scripts, win, dl,
    evento: (d: unknown) => oyentes['cookie-consent-updated']({ detail: d }),
    track: (n: string, d?: object) => (win.saastroTrack as (n: string, d?: object) => string[])(n, d),
  };
}
const ck = (o: object) => 'cookie_consent=' + encodeURIComponent(JSON.stringify(o));
const SOLO_ANALYTICS = ck({ analytics: true, marketing: false });
const SOLO_MARKETING = ck({ analytics: false, marketing: true });
const TODO = ck({ analytics: true, marketing: true });

describe('Consent Mode v2', () => {
  it('lo primero en el dataLayer es consent default con TODO denied', () => {
    const { dl } = ejecutar('', [GA4, GTM]);
    expect(dl()[0].slice(0, 2)).toEqual(['consent', 'default']);
    expect(dl()[0][2]).toMatchObject({ analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  });

  it('sin ningún proveedor de Google no se toca el dataLayer', () => {
    const r = ejecutar('', [META]);
    expect(r.dl()).toEqual([]);
  });

  it('update refleja cada categoría por separado', () => {
    const upd = (c: string) => ejecutar(c, [GA4]).dl().find((a) => a[0] === 'consent' && a[1] === 'update')![2];
    expect(upd(SOLO_ANALYTICS)).toMatchObject({ analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    expect(upd(SOLO_MARKETING)).toMatchObject({ analytics_storage: 'denied', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' });
  });
});

describe('qué carga con cada consentimiento', () => {
  it('sin cookie o todo rechazado no carga NINGÚN script', () => {
    expect(ejecutar('', TODOS).scripts).toEqual([]);
    expect(ejecutar(ck({ analytics: false, marketing: false }), TODOS).scripts).toEqual([]);
  });

  it('cookie VIEJA (sin marketing) con analytics: GA4, GTM y Clarity; nada de anuncios', () => {
    const s = ejecutar(ck({ analytics: true, personalization: true }), TODOS).scripts.join(' ');
    expect(s).toContain('gtag/js?id=G-TEST123456');
    expect(s).toContain('gtm.js?id=GTM-TEST123');
    expect(s).toContain('clarity.ms/tag/abcdefgh12');
    for (const prohibido of ['fbevents.js', 'tiktok.com', 'licdn.com']) expect(s).not.toContain(prohibido);
  });

  it('solo marketing: GTM, Meta, TikTok y LinkedIn; NI GA4 NI Clarity', () => {
    const s = ejecutar(SOLO_MARKETING, TODOS).scripts.join(' ');
    for (const ok of ['gtm.js', 'fbevents.js', 'tiktok.com/i18n/pixel/events.js?sdkid=ABCDEFGHIJ12345', 'licdn.com']) expect(s).toContain(ok);
    expect(s).not.toContain('clarity.ms');
    expect(s).not.toContain('gtag/js?id=G-TEST123456');
  });

  it('Google Ads y GA4 comparten UN solo gtag.js', () => {
    const r = ejecutar(TODO, [GA4, ADS]);
    expect(r.scripts.filter((s) => s.includes('gtag/js'))).toHaveLength(1);
    const configs = r.dl().filter((a) => a[0] === 'config').map((a) => a[1]);
    expect(configs.sort()).toEqual(['AW-123456789', 'G-TEST123456']);
  });

  it('aceptar después (evento) carga lo que toca, una sola vez', () => {
    const r = ejecutar('', [GTM, META]);
    r.evento({ analytics: false, marketing: true });
    r.evento({ analytics: false, marketing: true });
    expect(r.scripts.filter((s) => s.includes('gtm.js'))).toHaveLength(1);
    expect(r.scripts.filter((s) => s.includes('fbevents.js'))).toHaveLength(1);
  });

  it('un evento con valores no booleanos no concede nada', () => {
    const r = ejecutar('', TODOS);
    r.evento({ analytics: 'true', marketing: 1 });
    expect(r.scripts).toEqual([]);
  });

  it('marca window.trackersLoaded solo si algo se cargó (el banner recarga al revocar)', () => {
    expect(ejecutar('', TODOS).win.trackersLoaded).toBeUndefined();
    expect(ejecutar(SOLO_ANALYTICS, TODOS).win.trackersLoaded).toBe(true);
  });
});

describe('saastroTrack (conversión)', () => {
  it('sin consentimiento no llega a nadie', () => {
    const r = ejecutar('', TODOS, 'AbCdEfGhIj_k');
    expect(r.track('generate_lead', { event_id: 'e1' })).toEqual([]);
  });

  it('con todo: llega a los cargados, con el MISMO event_id en Meta y TikTok', () => {
    const r = ejecutar(TODO, TODOS, 'AbCdEfGhIj_k');
    const llamadas: unknown[][] = [];
    (r.win.fbq as unknown) = (...a: unknown[]) => llamadas.push(['fbq', ...a]);
    (r.win.ttq as { track: unknown }).track = (...a: unknown[]) => llamadas.push(['ttq', ...a]);
    const sent = r.track('generate_lead', { event_id: 'abc-123' });
    expect(sent.sort()).toEqual(['clarity', 'ga4', 'googleAds', 'gtm', 'metaPixel', 'tiktokPixel']);
    expect(llamadas).toContainEqual(['fbq', 'track', 'Lead', {}, { eventID: 'abc-123' }]);
    expect(llamadas).toContainEqual(['ttq', 'SubmitForm', {}, { event_id: 'abc-123' }]);
    const conv = r.dl().find((a) => a[0] === 'event' && a[1] === 'conversion');
    expect(conv![2]).toEqual({ send_to: 'AW-123456789/AbCdEfGhIj_k' });
    expect(r.dl().some((a) => a.event === 'generate_lead' && a.event_id === 'abc-123')).toBe(true);
  });

  it('solo analytics: no emite a los de anuncios aunque estén configurados', () => {
    const r = ejecutar(SOLO_ANALYTICS, TODOS, 'AbCdEfGhIj_k');
    const sent = r.track('generate_lead', { event_id: 'x' });
    expect(sent).not.toContain('metaPixel');
    expect(sent).not.toContain('tiktokPixel');
    expect(sent).not.toContain('googleAds');
    expect(sent).toContain('ga4');
  });

  it('sin etiqueta de conversión no se emite conversion de Google Ads', () => {
    const r = ejecutar(SOLO_MARKETING, [ADS], '');
    expect(r.track('generate_lead')).toEqual([]);
  });

  it('un evento que no es lead va como custom a Meta', () => {
    const r = ejecutar(SOLO_MARKETING, [META]);
    const llamadas: unknown[][] = [];
    (r.win.fbq as unknown) = (...a: unknown[]) => llamadas.push(a);
    r.track('click_whatsapp', { event_id: 'z' });
    expect(llamadas).toContainEqual(['trackCustom', 'click_whatsapp', {}, { eventID: 'z' }]);
  });
});
