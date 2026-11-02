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
import { consentCovers, parseConsent } from '../lib/cookies';

const fuente = readFileSync(new URL('./Analytics.astro', import.meta.url), 'utf8');
const CODIGO = fuente.match(/<script is:inline[^>]*>([\s\S]*?)<\/script>/)![1];

type P = { key: string; id: string; ids: string[]; category: 'analytics' | 'marketing' | 'any' | 'none' };
const mk = (key: string, category: P['category'], ...ids: string[]): P => ({ key, id: ids[0], ids, category });
const GA4 = mk('ga4', 'analytics', 'G-TEST123456');
const GTM = mk('gtm', 'any', 'GTM-TEST123');
const ADS = mk('googleAds', 'marketing', 'AW-123456789');
const META = mk('metaPixel', 'marketing', '1234567890123');
const TIKTOK = mk('tiktokPixel', 'marketing', 'ABCDEFGHIJ12345');
const LINKEDIN = mk('linkedinPartnerId', 'marketing', '1234567');
const CLARITY = mk('clarity', 'analytics', 'abcdefgh12');
const CF_TOKEN = 'c0ffee00c0ffee00c0ffee00c0ffee00';
const CF = mk('cloudflareWebAnalytics', 'none', CF_TOKEN);
const TODOS = [GA4, GTM, ADS, META, TIKTOK, LINKEDIN, CLARITY];

interface Scr { src?: string; defer?: boolean; attrs: Record<string, string>; onload?: () => void }
interface Opciones {
  host?: string;
  ownHost?: string;
  /** Conversiones de Google Ads por cuenta (por defecto: `adsLabel` con la primera cuenta). */
  adsConv?: Array<{ id: string; label: string }>;
}

function ejecutar(cookie: string, providers: P[], adsLabel = '', opts: Opciones = {}) {
  const { host = 'sitio.example', ownHost = '' } = opts;
  const scripts: string[] = [];
  const elementos: Scr[] = [];
  const llamadasHistorial: unknown[][] = [];
  const oyentes: Record<string, (e: unknown) => void> = {};
  const insert = (s: Scr) => { scripts.push(s.src ?? ''); elementos.push(s); };
  const doc = {
    cookie,
    readyState: 'complete',
    head: { appendChild: insert },
    getElementsByTagName: () => [{ parentNode: { insertBefore: insert } }],
    createElement: () => {
      const e: Scr & { setAttribute?: (k: string, v: string) => void } = { attrs: {} };
      e.setAttribute = (k, v) => { e.attrs[k] = v; };
      return e;
    },
    addEventListener: () => {},
  };
  const win: Record<string, unknown> = {
    document: doc,
    addEventListener: (n: string, f: (e: unknown) => void) => { oyentes[n] = f; },
  };
  win.window = win;
  const historial = {
    pushState: (...a: unknown[]) => { llamadasHistorial.push(['pushState', ...a]); },
    replaceState: (...a: unknown[]) => { llamadasHistorial.push(['replaceState', ...a]); },
  };
  const location = { hostname: host, href: `https://${host}/pagina`, origin: `https://${host}` };
  // Sin `adsConv` explícito, la etiqueta de la prueba se asocia a la primera cuenta de Google Ads.
  const ads = providers.find((p) => p.key === 'googleAds');
  const adsConv = opts.adsConv ?? (adsLabel && ads ? [{ id: ads.ids[0], label: adsLabel }] : []);
  runInNewContext(CODIGO, {
    providers, adsConv, ownHost, window: win, document: doc, location, history: historial, URL,
    encodeURIComponent, decodeURIComponent, JSON, Date, Array, Object,
  });
  // gtag empuja objetos `arguments` (→ array); GTM empuja objetos planos (se dejan tal cual).
  const dl = () =>
    (win.dataLayer as any[]).map((a) => (Object.prototype.toString.call(a) === '[object Arguments]' ? Array.from(a) : a));
  return {
    scripts, win, dl, elementos, historial, llamadasHistorial,
    evento: (d: unknown) => oyentes['cookie-consent-updated']({ detail: d }),
    track: (n: string, d?: object) => (win.saastroTrack as (n: string, d?: object) => string[])(n, d),
  };
}
// Por defecto la cookie lleva TODOS los proveedores del catálogo (consentimiento
// vigente); una prueba de versión pasa `providers` explícito (o `undefined`).
const ck = (o: object) => 'cookie_consent=' + encodeURIComponent(JSON.stringify({ providers: TODOS.map((p) => p.key), ...o }));
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

describe('Cloudflare Web Analytics: exento de consentimiento, mismo cargador, mismo bloqueo de hosts', () => {
  const beacon = (r: { elementos: Scr[] }) => r.elementos.filter((e) => (e.src ?? '').includes('cloudflareinsights.com'));

  it('SIN consentimiento carga el beacon y NINGÚN otro proveedor', () => {
    const r = ejecutar('', [...TODOS, CF]);
    expect(r.scripts).toEqual(['https://static.cloudflareinsights.com/beacon.min.js']);
    const [b] = beacon(r);
    expect(b.defer).toBe(true);
    expect(JSON.parse(b.attrs['data-cf-beacon'])).toEqual({ token: CF_TOKEN });
  });

  it('con consentimiento rechazado tampoco carga nada más; con consentimiento total, el beacon sale UNA vez', () => {
    expect(ejecutar(ck({ analytics: false, marketing: false }), [...TODOS, CF]).scripts).toEqual([
      'https://static.cloudflareinsights.com/beacon.min.js',
    ]);
    const r = ejecutar(TODO, [...TODOS, CF]);
    expect(beacon(r)).toHaveLength(1);
    r.evento({ analytics: true, marketing: true });
    expect(beacon(r)).toHaveLength(1);
  });

  it('un evento de consentimiento posterior no vuelve a cargarlo', () => {
    const r = ejecutar('', [GA4, CF]);
    r.evento({ analytics: true, marketing: false });
    expect(beacon(r)).toHaveLength(1);
    expect(r.scripts.filter((s) => s.includes('gtag/js'))).toHaveLength(1);
  });

  const HOSTS: Array<[string, string, boolean]> = [
    ['localhost', '', false],
    ['127.0.0.1', '', false],
    ['preview.saastro.io', 'theme.saastro.io', false],
    ['theme.saastro.io', '', false], // sin host propio: *.saastro.io bloqueado
    ['x.saastro.test', '', false],
    ['foo.local', '', false],
    ['theme.saastro.io', 'theme.saastro.io', true], // host propio de la flota: se mide
    ['www.cliente.com', '', true],
  ];
  it.each(HOSTS)('host %s (propio %j) -> carga=%s', (host, ownHost, carga) => {
    expect(beacon(ejecutar('', [CF], '', { host, ownHost })).length).toBe(carga ? 1 : 0);
  });

  it('la exención la da la categoría del catálogo, no el nombre: «cloudflareWebAnalytics» con otra categoría NO carga sin consentimiento', () => {
    const noExento = mk('cloudflareWebAnalytics', 'analytics', CF_TOKEN);
    expect(beacon(ejecutar('', [noExento]))).toHaveLength(0);
  });

  it('NO marca trackersLoaded (revocar el consentimiento no recarga la página por él)', () => {
    expect(ejecutar('', [CF]).win.trackersLoaded).toBeUndefined();
    expect(ejecutar(TODO, [CF]).win.trackersLoaded).toBeUndefined();
  });

  it('NO es un destino de saastroTrack y no toca el dataLayer', () => {
    const r = ejecutar(TODO, [CF]);
    expect(r.track('generate_lead', { event_id: 'e' })).toEqual([]);
    expect(r.dl()).toEqual([]);
  });

  it('NO cuenta en la versión del consentimiento: una cookie que cubre los demás sigue valiendo', () => {
    // Si CF entrara en KEYS, esta cookie (sin 'cloudflareWebAnalytics') dejaría de cubrir y GA4 no cargaría.
    const c = ck({ analytics: true, marketing: false, providers: ['ga4'] });
    const r = ejecutar(c, [GA4, CF]);
    expect(r.scripts.some((s) => s.includes('gtag/js?id=G-TEST123456'))).toBe(true);
    expect(beacon(r)).toHaveLength(1);
  });

  it('shim: normaliza URLs del mismo origen a ruta relativa y deja pasar lo demás', () => {
    const r = ejecutar('', [CF]);
    beacon(r)[0].onload!();
    const h = r.historial as { pushState: (...a: unknown[]) => void; replaceState: (...a: unknown[]) => void };
    h.pushState({ n: 1 }, '', 'https://sitio.example/otra?x=1#ancla');
    h.replaceState(null, '', '/ya-relativa');
    h.pushState(null, '', 'https://otro.example/fuera');
    h.pushState(null, '', undefined);
    expect(r.llamadasHistorial).toEqual([
      ['pushState', { n: 1 }, '', '/otra?x=1#ancla'],
      ['replaceState', null, '', '/ya-relativa'],
      ['pushState', null, '', 'https://otro.example/fuera'],
      ['pushState', null, '', undefined],
    ]);
  });
});

describe('varios ids por proveedor', () => {
  const dosGA = mk('ga4', 'analytics', 'G-AAAAAA0001', 'G-BBBBBB0002');

  it('GA4 con dos ids: UN gtag.js (con el primero) y un config por id', () => {
    const r = ejecutar(SOLO_ANALYTICS, [dosGA]);
    expect(r.scripts.filter((s) => s.includes('gtag/js'))).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-AAAAAA0001']);
    expect(r.dl().filter((a) => a[0] === 'config').map((a) => a[1])).toEqual(['G-AAAAAA0001', 'G-BBBBBB0002']);
  });

  it('GA4 (2 ids) + Google Ads (2 cuentas) comparten UN gtag.js y suman 4 config', () => {
    const dosAds = mk('googleAds', 'marketing', 'AW-111111111', 'AW-222222222');
    const r = ejecutar(TODO, [dosGA, dosAds]);
    expect(r.scripts.filter((s) => s.includes('gtag/js'))).toHaveLength(1);
    expect(r.dl().filter((a) => a[0] === 'config').map((a) => a[1]).sort()).toEqual(
      ['AW-111111111', 'AW-222222222', 'G-AAAAAA0001', 'G-BBBBBB0002'],
    );
  });

  it('GTM con dos contenedores: un gtm.js y un gtm.start por contenedor', () => {
    const r = ejecutar(SOLO_MARKETING, [mk('gtm', 'any', 'GTM-AAAA111', 'GTM-BBBB222')]);
    expect(r.scripts.filter((s) => s.includes('gtm.js'))).toEqual([
      'https://www.googletagmanager.com/gtm.js?id=GTM-AAAA111',
      'https://www.googletagmanager.com/gtm.js?id=GTM-BBBB222',
    ]);
    expect(r.dl().filter((a) => a.event === 'gtm.js')).toHaveLength(2);
  });

  it('Meta con dos píxeles: un fbevents.js, un init por id y UN solo PageView', () => {
    const r = ejecutar(SOLO_MARKETING, [mk('metaPixel', 'marketing', '1111111111', '2222222222')]);
    expect(r.scripts.filter((s) => s.includes('fbevents.js'))).toHaveLength(1);
    const cola = ((r.win.fbq as { queue: unknown[] }).queue).map((a) => Array.from(a as ArrayLike<unknown>));
    expect(cola).toEqual([['init', '1111111111'], ['init', '2222222222'], ['track', 'PageView']]);
  });

  it('TikTok con dos píxeles: un load por id (dos sdkid) y UNA sola page()', () => {
    const r = ejecutar(SOLO_MARKETING, [mk('tiktokPixel', 'marketing', 'AAAAAAAAAA11111', 'BBBBBBBBBB22222')]);
    expect(r.scripts.filter((s) => s.includes('sdkid='))).toEqual([
      'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=AAAAAAAAAA11111&lib=ttq',
      'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=BBBBBBBBBB22222&lib=ttq',
    ]);
    const cola = (r.win.ttq as unknown[][]).filter((x) => x[0] === 'page');
    expect(cola).toHaveLength(1);
  });

  it('LinkedIn con dos partner ids: ambos en la lista y la etiqueta una vez', () => {
    const r = ejecutar(SOLO_MARKETING, [mk('linkedinPartnerId', 'marketing', '1234567', '7654321')]);
    expect(r.win._linkedin_data_partner_ids).toEqual(['1234567', '7654321']);
    expect(r.scripts.filter((s) => s.includes('licdn.com'))).toHaveLength(1);
  });

  it('Clarity usa UN solo proyecto aunque llegue una lista', () => {
    const r = ejecutar(SOLO_ANALYTICS, [mk('clarity', 'analytics', 'abcdefgh12', 'zzzzzzzz99')]);
    expect(r.scripts.filter((s) => s.includes('clarity.ms'))).toEqual(['https://www.clarity.ms/tag/abcdefgh12']);
  });

  it('saastroTrack: la conversión de Google Ads sale a cada cuenta con SU etiqueta; Meta recibe un solo Lead', () => {
    const dosAds = mk('googleAds', 'marketing', 'AW-111111111', 'AW-222222222');
    const dosMeta = mk('metaPixel', 'marketing', '1111111111', '2222222222');
    const r = ejecutar(TODO, [dosGA, dosAds, dosMeta], '', {
      adsConv: [{ id: 'AW-111111111', label: 'LabelUno_11' }, { id: 'AW-222222222', label: 'LabelDos_22' }],
    });
    const sent = r.track('generate_lead', { event_id: 'abc' });
    expect(sent.sort()).toEqual(['ga4', 'googleAds', 'metaPixel']);
    const conv = r.dl().filter((a) => a[0] === 'event' && a[1] === 'conversion').map((a) => a[2].send_to);
    expect(conv).toEqual(['AW-111111111/LabelUno_11', 'AW-222222222/LabelDos_22']);
    // GA4: UN event sin send_to (gtag lo reparte a todos los config).
    expect(r.dl().filter((a) => a[0] === 'event' && a[1] === 'generate_lead')).toHaveLength(1);
    const cola = ((r.win.fbq as { queue: unknown[] }).queue).map((a) => Array.from(a as ArrayLike<unknown>));
    expect(cola.filter((a) => a[0] === 'track' && a[1] === 'Lead')).toHaveLength(1);
  });

  it('sin conversiones configuradas no se emite conversion de Google Ads', () => {
    const r = ejecutar(SOLO_MARKETING, [mk('googleAds', 'marketing', 'AW-111111111', 'AW-222222222')], '', { adsConv: [] });
    expect(r.track('generate_lead')).toEqual([]);
  });
});

describe('versión del consentimiento: el inline NO diverge de consentCovers', () => {
  const claves = (ps: P[]) => ps.map((p) => p.key);
  const CONJUNTOS: P[][] = [[], [GA4], [GA4, CLARITY], [GA4, CLARITY, META], [GTM], [META]];
  const GUARDADOS: Array<string[] | 'ausente' | 'cadena' | 'mezcla'> = [
    'ausente', 'cadena', 'mezcla', [], ['ga4'], ['clarity'], ['ga4', 'clarity'], ['ga4', 'clarity', 'metaPixel'], ['gtm'], ['metaPixel'],
  ];
  const cookie = (g: (typeof GUARDADOS)[number]) => {
    const base: Record<string, unknown> = { analytics: true, marketing: true, providers: undefined };
    if (g === 'cadena') base.providers = 'ga4';
    else if (g === 'mezcla') base.providers = ['ga4', 1];
    else if (g !== 'ausente') base.providers = g;
    return ck(base);
  };

  it('para cada combinación carga algo SII la función pura dice que cubre', () => {
    let casos = 0;
    for (const ps of CONJUNTOS) for (const g of GUARDADOS) {
      const c = cookie(g);
      const cubre = consentCovers(parseConsent(c), claves(ps));
      const cargo = ejecutar(c, ps).scripts.length > 0;
      // Con proveedores encendidos y consentimiento total, cargar <=> cubre.
      expect(cargo, `${JSON.stringify(claves(ps))} vs ${JSON.stringify(g)}`).toBe(ps.length > 0 && cubre);
      casos++;
    }
    expect(casos).toBe(CONJUNTOS.length * GUARDADOS.length);
  });

  it('cookie antigua sin providers + proveedor encendido: no carga NADA ni concede Consent Mode', () => {
    const r = ejecutar(ck({ analytics: true, marketing: true, providers: undefined }), [GA4, CLARITY]);
    expect(r.scripts).toEqual([]);
    expect(r.dl().filter((a) => a[1] === 'update')).toEqual([]);
  });

  it('cookie con providers que cubre: carga', () => {
    const r = ejecutar(ck({ analytics: true, marketing: false, providers: ['clarity', 'ga4'] }), [GA4, CLARITY]);
    expect(r.scripts.length).toBe(2);
  });

  it('añadir un proveedor invalida lo guardado', () => {
    const c = ck({ analytics: true, marketing: false, providers: ['ga4'] });
    expect(ejecutar(c, [GA4]).scripts.length).toBe(1);
    expect(ejecutar(c, [GA4, CLARITY]).scripts).toEqual([]);
  });
});

describe('GenTracking (consent="required") aplica la MISMA regla', () => {
  const gen = readFileSync(new URL('./GenTracking.astro', import.meta.url), 'utf8');
  const GEN = gen.match(/<script[^>]*is:inline[^>]*>([\s\S]*?)<\/script>/)![1];

  function arrancaGen(cookie: string, keys: string[], granted = true) {
    const enviados: string[] = [];
    const doc = {
      cookie,
      readyState: 'complete',
      currentScript: { dataset: { genWorkspace: 'ws_1', genConsent: 'required', genKeys: JSON.stringify(keys) } },
      getElementsByTagName: () => [],
      addEventListener: () => {},
    };
    const win: Record<string, unknown> = { addEventListener: () => {} };
    win.window = win;
    runInNewContext(GEN, {
      window: win, document: doc, JSON, Date, Array, Object, String, Math, URLSearchParams, Blob,
      encodeURIComponent, decodeURIComponent,
      location: { hostname: 'sitio.example', href: 'https://sitio.example/', pathname: '/', search: '' },
      localStorage: { getItem: () => (granted ? 'granted' : null) },
      sessionStorage: { getItem: () => 'vid', setItem: () => {} },
      navigator: { sendBeacon: (u: string) => { enviados.push(u); return true; } },
    });
    return enviados.length > 0;
  }

  it('arranca <=> gen-consent granted Y la función pura dice que cubre (misma matriz que el inline de Analytics)', () => {
    for (const ps of CONJUNTOS_GEN) for (const g of GUARDADOS_GEN) {
      const c = cookieGen(g);
      const k = ps.map((p) => p.key);
      expect(arrancaGen(c, k), `${JSON.stringify(k)} vs ${JSON.stringify(g)}`).toBe(consentCovers(parseConsent(c), k));
    }
  });

  it('sin cookie no arranca aunque gen-consent siga granted; sin granted no arranca aunque cubra', () => {
    expect(arrancaGen('', ['ga4'])).toBe(false);
    expect(arrancaGen(ck({ analytics: true, providers: ['ga4'] }), ['ga4'], false)).toBe(false);
  });

  it('cookie antigua sin providers + proveedor encendido: no arranca; con providers que cubre: sí', () => {
    expect(arrancaGen(ck({ analytics: true, providers: undefined }), ['ga4'])).toBe(false);
    expect(arrancaGen(ck({ analytics: true, providers: ['ga4'] }), ['ga4'])).toBe(true);
  });
});
const CONJUNTOS_GEN: P[][] = [[], [GA4], [GA4, CLARITY], [GA4, CLARITY, META], [GTM]];
const GUARDADOS_GEN: Array<string[] | 'ausente' | 'cadena'> = ['ausente', 'cadena', [], ['ga4'], ['ga4', 'clarity'], ['ga4', 'clarity', 'metaPixel'], ['gtm']];
const cookieGen = (g: (typeof GUARDADOS_GEN)[number]) =>
  ck({ analytics: true, marketing: true, providers: g === 'ausente' ? undefined : g === 'cadena' ? 'ga4' : g });
