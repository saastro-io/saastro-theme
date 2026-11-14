/**
 * Override de píxeles por landing (frontmatter `tracking:` + `trackingMode:`).
 *
 * Lo que se protege, en orden de gravedad:
 *   - una landing NO filtra su override a otra página (resolución por petición, sin estado);
 *   - cada proveedor sigue su categoría/puerta, y la versión del consentimiento es la UNIÓN
 *     site+landing (quien consintió en el site vuelve a ver el banner SOLO en la landing que
 *     trae un proveedor que no vio);
 *   - `add` suma y `replace` sustituye por proveedor, nunca al revés;
 *   - un id inválido o una clave ajena JAMÁS se inyecta.
 * Los ids son ficticios y de baja entropía a propósito (gitleaks).
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { consentCovers } from './cookies';
import { LANDING_KEYS, describeRejected, resolveTracking, type LandingTracking } from './tracking';

const vacio = { analytics: { googleAnalytics: { id: '' }, googleTagManager: { id: '' } } };
const site = (tracking: Record<string, unknown>) => ({ ...vacio, tracking });
const ids = (r: ReturnType<typeof resolveTracking>, k: string) => r.providers.find((p) => p.key === k)?.ids;
const claves = (r: ReturnType<typeof resolveTracking>) => r.providers.map((p) => p.key).sort();

const META_A = '1111111111111';
const META_B = '2222222222222';
const GA_A = 'G-AAAAAAAAAA';
const GA_B = 'G-BBBBBBBBBB';
const AW_A = 'AW-111111111';
const AW_B = 'AW-222222222';
const TT = 'TTTTTTTTTTTTTTT';

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
}

describe('modo add (por defecto): suma a los del site', () => {
  it('los ids de la landing se añaden a los del site, en ese orden y sin repetir', () => {
    const r = resolveTracking(site({ metaPixel: META_A, ga4: GA_A }), { landing: { tracking: { metaPixel: `${META_B},${META_A}` } } });
    expect(ids(r, 'metaPixel')).toEqual([META_A, META_B]);
    expect(ids(r, 'ga4')).toEqual([GA_A]);
  });

  it('sin trackingMode es add; "add" explícito es lo mismo', () => {
    const l = { metaPixel: META_B };
    const a = resolveTracking(site({ metaPixel: META_A }), { landing: { tracking: l } });
    const b = resolveTracking(site({ metaPixel: META_A }), { landing: { tracking: l, mode: 'add' } });
    expect(ids(a, 'metaPixel')).toEqual([META_A, META_B]);
    expect(b).toEqual(a);
  });

  it('un proveedor que el site no tiene se enciende solo en la landing', () => {
    const r = resolveTracking(site({ ga4: GA_A }), { landing: { tracking: { tiktokPixel: TT } } });
    expect(claves(r)).toEqual(['ga4', 'tiktokPixel']);
  });

  it('el tope por proveedor se aplica sobre la SUMA y avisa como landing', () => {
    const cinco = ['1000000001', '1000000002', '1000000003', '1000000004', '1000000005'];
    const r = resolveTracking(site({ metaPixel: cinco.slice(0, 4).join(',') }), { landing: { tracking: { metaPixel: `${cinco[4]},1000000006` } } });
    expect(ids(r, 'metaPixel')).toEqual(cinco);
    expect(r.rejected).toContainEqual({ key: 'metaPixel', reason: 'tope', max: 5, origen: 'landing' });
  });
});

describe('modo replace: sustituye SOLO los proveedores que la landing trae', () => {
  const L = (tracking: Record<string, unknown>): LandingTracking => ({ tracking, mode: 'replace' });

  it('Meta de la landing sustituye al del site; GA4 del site se mantiene', () => {
    const r = resolveTracking(site({ metaPixel: META_A, ga4: GA_A }), { landing: L({ metaPixel: META_B }) });
    expect(ids(r, 'metaPixel')).toEqual([META_B]);
    expect(ids(r, 'ga4')).toEqual([GA_A]);
  });

  it('un proveedor en blanco en la landing HEREDA el del site (un campo vacío del Hub no apaga nada)', () => {
    const r = resolveTracking(site({ metaPixel: META_A, ga4: GA_A }), { landing: L({ metaPixel: '', ga4: '   ' }) });
    expect(ids(r, 'metaPixel')).toEqual([META_A]);
    expect(ids(r, 'ga4')).toEqual([GA_A]);
  });

  it('si TODO lo que trae la landing es inválido, el proveedor se APAGA ahí: nunca hereda el píxel del site', () => {
    const r = resolveTracking(site({ metaPixel: META_A }), { landing: L({ metaPixel: "1');alert(1);//" }) });
    expect(ids(r, 'metaPixel')).toBeUndefined();
    expect(r.rejected).toContainEqual({ key: 'metaPixel', reason: 'formato', origen: 'landing' });
  });

  it('un id numérico sin comillas (no es cadena) en replace apaga ese proveedor y avisa', () => {
    const r = resolveTracking(site({ metaPixel: META_A }), { landing: L({ metaPixel: 2222222222222 }) });
    expect(ids(r, 'metaPixel')).toBeUndefined();
    expect(r.rejected).toContainEqual({ key: 'metaPixel', reason: 'no-cadena', origen: 'landing' });
  });

  it('el mismo caso en add NO quita nada del site', () => {
    const r = resolveTracking(site({ metaPixel: META_A }), { landing: { tracking: { metaPixel: 2222222222222 } } });
    expect(ids(r, 'metaPixel')).toEqual([META_A]);
  });

  it('el modo se normaliza (mayúsculas y espacios)', () => {
    const r = resolveTracking(site({ metaPixel: META_A }), { landing: { tracking: { metaPixel: META_B }, mode: ' Replace ' } });
    expect(ids(r, 'metaPixel')).toEqual([META_B]);
  });

  it('un modo desconocido cae a add (el que no quita nada) y avisa', () => {
    const r = resolveTracking(site({ metaPixel: META_A }), { landing: { tracking: { metaPixel: META_B }, mode: 'sustituir' } });
    expect(ids(r, 'metaPixel')).toEqual([META_A, META_B]);
    expect(r.rejected).toContainEqual({ key: 'trackingMode', reason: 'modo', origen: 'landing' });
  });
});

describe('no hay fuga entre páginas (resolución por petición, sin estado)', () => {
  it('después de resolver una landing, la misma configuración del site sin landing devuelve lo de siempre', () => {
    const s = site({ metaPixel: META_A, ga4: GA_A });
    const antes = resolveTracking(s);
    const conLanding = resolveTracking(s, { landing: { tracking: { metaPixel: META_B, tiktokPixel: TT }, mode: 'replace' } });
    const despues = resolveTracking(s);
    expect(ids(conLanding, 'metaPixel')).toEqual([META_B]);
    expect(despues).toEqual(antes);
    expect(ids(despues, 'metaPixel')).toEqual([META_A]);
    expect(claves(despues)).toEqual(['ga4', 'metaPixel']);
  });

  it('dos landings alternadas no se contaminan y el resultado no comparte arrays con los datos de entrada', () => {
    const s = site({ metaPixel: META_A });
    const l1: LandingTracking = { tracking: { metaPixel: META_B } };
    const l2: LandingTracking = { tracking: { tiktokPixel: TT } };
    const a1 = resolveTracking(s, { landing: l1 });
    const a2 = resolveTracking(s, { landing: l2 });
    const b1 = resolveTracking(s, { landing: l1 });
    expect(b1).toEqual(a1);
    expect(ids(a2, 'metaPixel')).toEqual([META_A]);
    expect(ids(a1, 'tiktokPixel')).toBeUndefined();
    ids(a1, 'metaPixel')!.push('9999999999');
    expect(ids(resolveTracking(s), 'metaPixel')).toEqual([META_A]);
    expect(ids(resolveTracking(s, { landing: l1 }), 'metaPixel')).toEqual([META_A, META_B]);
  });

  it('no muta ni los ajustes ni el frontmatter (el contenido de la colección se comparte entre peticiones)', () => {
    const s = deepFreeze(site({ metaPixel: META_A, googleAds: AW_A, googleAdsConversionLabel: 'LabelAAAAAA' }));
    const l = deepFreeze({ tracking: { metaPixel: META_B, googleAds: AW_B, googleAdsConversionLabel: 'LabelBBBBBB', clarity: 'abcdefgh12' }, mode: 'replace' });
    expect(() => resolveTracking(s, { landing: l })).not.toThrow();
  });

  it('noindex (vista previa) apaga TODO también con landing', () => {
    const r = resolveTracking(site({ metaPixel: META_A }), { noindex: true, landing: { tracking: { tiktokPixel: TT } } });
    expect(r.providers).toEqual([]);
    expect(r.consentKeys).toEqual([]);
  });

  it('el aviso de un id malo de una landing no sale en las demás páginas', () => {
    const s = site({ metaPixel: META_A });
    resolveTracking(s, { landing: { tracking: { metaPixel: 'malo' } } });
    expect(resolveTracking(s).rejected).toEqual([]);
  });
});

describe('consentimiento: la versión es la UNIÓN site + landing', () => {
  const s = site({ ga4: GA_A });
  const landing: LandingTracking = { tracking: { metaPixel: META_A } };

  it('la landing con un proveedor nuevo añade su clave y el banner ofrece marketing SOLO ahí', () => {
    const pagina = resolveTracking(s);
    const lp = resolveTracking(s, { landing });
    expect(pagina.consentKeys).toEqual(['ga4']);
    expect(pagina.showMarketing).toBe(false);
    expect(lp.consentKeys).toEqual(['ga4', 'metaPixel']);
    expect(lp.showMarketing).toBe(true);
  });

  it('quien consintió en el site (ga4) NO cubre la landing con Meta: vuelve a preguntar solo ahí', () => {
    const consent = { providers: ['ga4'] };
    expect(consentCovers(consent, resolveTracking(s).consentKeys)).toBe(true);
    expect(consentCovers(consent, resolveTracking(s, { landing }).consentKeys)).toBe(false);
  });

  it('lo que se consiente en la landing (ga4+meta) vale después en el site (superconjunto)', () => {
    const consent = { providers: resolveTracking(s, { landing }).consentKeys };
    expect(consentCovers(consent, resolveTracking(s).consentKeys)).toBe(true);
  });

  it('añadir otro id de un proveedor que el site YA tiene no cambia las claves (el consentimiento es por proveedor)', () => {
    const r = resolveTracking(site({ metaPixel: META_A }), { landing: { tracking: { metaPixel: META_B } } });
    expect(r.consentKeys).toEqual(['metaPixel']);
  });

  it('el override NO crea excepciones: Meta de landing es marketing, GTM de landing es any, y Cloudflare no se toca', () => {
    const r = resolveTracking(site({ cloudflareWebAnalytics: 'abcdefabcdefabcdefabcdefabcdefab' }), {
      landing: { tracking: { metaPixel: META_A, gtm: 'GTM-TEST123', cloudflareWebAnalytics: 'ffffffffffffffffffffffffffffffff' } },
    });
    expect(r.providers.find((p) => p.key === 'metaPixel')!.category).toBe('marketing');
    expect(r.providers.find((p) => p.key === 'gtm')!.category).toBe('any');
    expect(ids(r, 'cloudflareWebAnalytics')).toEqual(['abcdefabcdefabcdefabcdefabcdefab']); // el del site, intacto
    expect(r.consentKeys).toContain('cloudflareWebAnalytics'); // pide consentimiento de analítica, como Clarity
  });
});

describe('qué se puede sobrescribir y qué se descarta', () => {
  it('las claves permitidas son las del catálogo salvo Cloudflare y Clarity, más la etiqueta', () => {
    expect([...LANDING_KEYS].sort()).toEqual(
      ['ga4', 'googleAds', 'googleAdsConversionLabel', 'gtm', 'linkedinPartnerId', 'metaPixel', 'tiktokPixel'],
    );
  });

  it('clarity y cloudflareWebAnalytics en la landing se IGNORAN con aviso (en add y en replace)', () => {
    for (const mode of ['add', 'replace']) {
      const r = resolveTracking(site({ clarity: 'abcdefgh12' }), { landing: { tracking: { clarity: 'zzzzzzzz99', cloudflareWebAnalytics: 'ffffffffffffffffffffffffffffffff' }, mode } });
      expect(ids(r, 'clarity')).toEqual(['abcdefgh12']);
      expect(ids(r, 'cloudflareWebAnalytics')).toBeUndefined();
      expect(r.rejected).toContainEqual({ key: 'clarity', reason: 'clave', origen: 'landing' });
      expect(r.rejected).toContainEqual({ key: 'cloudflareWebAnalytics', reason: 'clave', origen: 'landing' });
    }
  });

  it('una clave desconocida se ignora con aviso y no enciende nada', () => {
    const r = resolveTracking(vacio, { landing: { tracking: { pixelInventado: '123', __proto__x: 'x' } } });
    expect(r.providers).toEqual([]);
    expect(r.rejected.map((x) => x.key).sort()).toEqual(['__proto__x', 'pixelInventado']);
  });

  it('ids hostiles o con formato malo no se inyectan; los buenos de la misma lista sí', () => {
    const r = resolveTracking(vacio, { landing: { tracking: { metaPixel: `"><script>,${META_B},1');x(`, ga4: 'UA-1' } } });
    expect(ids(r, 'metaPixel')).toEqual([META_B]);
    expect(ids(r, 'ga4')).toBeUndefined();
    expect(r.rejected.filter((x) => x.origen === 'landing' && x.reason === 'formato').map((x) => x.key).sort()).toEqual(['ga4', 'metaPixel', 'metaPixel']);
  });

  it('`tracking` que no es un objeto (cadena, lista) se ignora con aviso', () => {
    for (const raro of ['metaPixel: x', ['metaPixel'], 5]) {
      const r = resolveTracking(site({ ga4: GA_A }), { landing: { tracking: raro } });
      expect(claves(r)).toEqual(['ga4']);
      expect(r.rejected).toContainEqual({ key: 'tracking', reason: 'clave', origen: 'landing' });
    }
  });

  it('claves del prototipo no cuentan', () => {
    const l = JSON.parse('{"tracking": {"__proto__": {"metaPixel": "1111111111111"}}}') as LandingTracking;
    expect(resolveTracking(vacio, { landing: l }).providers).toEqual([]);
  });

  it('los descartes del site conservan su forma (sin `origen`)', () => {
    const r = resolveTracking(site({ metaPixel: 'malo' }));
    expect(r.rejected).toEqual([{ key: 'metaPixel', reason: 'formato' }]);
  });

  it('describeRejected nombra el origen', () => {
    expect(describeRejected({ key: 'metaPixel', reason: 'formato', origen: 'landing' })).toContain('landing.tracking.metaPixel');
    expect(describeRejected({ key: 'metaPixel', reason: 'formato' })).toContain('settings.tracking.metaPixel');
    expect(describeRejected({ key: 'clarity', reason: 'clave', origen: 'landing' })).toContain('IGNORADO');
    expect(describeRejected({ key: 'trackingMode', reason: 'modo', origen: 'landing' })).toContain('add');
  });
});

describe('etiqueta de conversión de Google Ads', () => {
  const conv = (r: ReturnType<typeof resolveTracking>) => r.googleAdsConversions;

  it('la de la landing se empareja por posición con las cuentas de la LANDING', () => {
    const r = resolveTracking(vacio, { landing: { tracking: { googleAds: `${AW_A},${AW_B}`, googleAdsConversionLabel: ',LabelBBBBBB' } } });
    expect(conv(r)).toEqual([{ id: AW_B, label: 'LabelBBBBBB' }]);
  });

  it('add: la del site sigue con la cuenta del site y la de la landing con la suya', () => {
    const r = resolveTracking(site({ googleAds: AW_A, googleAdsConversionLabel: 'LabelAAAAAA' }), {
      landing: { tracking: { googleAds: AW_B, googleAdsConversionLabel: 'LabelBBBBBB' } },
    });
    expect(ids(r, 'googleAds')).toEqual([AW_A, AW_B]);
    expect(conv(r)).toEqual([{ id: AW_A, label: 'LabelAAAAAA' }, { id: AW_B, label: 'LabelBBBBBB' }]);
  });

  it('add sin etiqueta en la landing: la cuenta de la landing NO hereda la etiqueta del site', () => {
    const r = resolveTracking(site({ googleAds: AW_A, googleAdsConversionLabel: 'LabelAAAAAA' }), { landing: { tracking: { googleAds: AW_B } } });
    expect(conv(r)).toEqual([{ id: AW_A, label: 'LabelAAAAAA' }]);
  });

  it('replace: las cuentas del site desaparecen y sus etiquetas con ellas; no pasan a la cuenta nueva', () => {
    const r = resolveTracking(site({ googleAds: AW_A, googleAdsConversionLabel: 'LabelAAAAAA' }), {
      landing: { tracking: { googleAds: AW_B }, mode: 'replace' },
    });
    expect(ids(r, 'googleAds')).toEqual([AW_B]);
    expect(conv(r)).toEqual([]);
    expect(r.googleAdsConversionLabel).toBe('');
  });

  it('replace con la MISMA cuenta y sin etiqueta propia: no hereda la etiqueta del site', () => {
    const r = resolveTracking(site({ googleAds: AW_A, googleAdsConversionLabel: 'LabelAAAAAA' }), {
      landing: { tracking: { googleAds: AW_A }, mode: 'replace' },
    });
    expect(ids(r, 'googleAds')).toEqual([AW_A]);
    expect(conv(r)).toEqual([]);
  });

  it('replace con cuenta y etiqueta de la landing: solo sale la de la landing', () => {
    const r = resolveTracking(site({ googleAds: AW_A, googleAdsConversionLabel: 'LabelAAAAAA' }), {
      landing: { tracking: { googleAds: AW_B, googleAdsConversionLabel: 'LabelBBBBBB' }, mode: 'replace' },
    });
    expect(conv(r)).toEqual([{ id: AW_B, label: 'LabelBBBBBB' }]);
  });

  it('replace de otro proveedor deja intacta la conversión del site', () => {
    const r = resolveTracking(site({ googleAds: AW_A, googleAdsConversionLabel: 'LabelAAAAAA', metaPixel: META_A }), {
      landing: { tracking: { metaPixel: META_B }, mode: 'replace' },
    });
    expect(conv(r)).toEqual([{ id: AW_A, label: 'LabelAAAAAA' }]);
  });

  it('la misma cuenta con etiqueta distinta en site y landing: gana la de la landing, una sola entrada', () => {
    const r = resolveTracking(site({ googleAds: AW_A, googleAdsConversionLabel: 'LabelAAAAAA' }), {
      landing: { tracking: { googleAds: AW_A, googleAdsConversionLabel: 'LabelBBBBBB' } },
    });
    expect(conv(r)).toEqual([{ id: AW_A, label: 'LabelBBBBBB' }]);
  });

  it('una etiqueta de la landing sin cuenta de Google Ads propia no significa nada; una inválida avisa', () => {
    const r = resolveTracking(site({ googleAds: AW_A }), { landing: { tracking: { googleAdsConversionLabel: 'LabelBBBBBB' } } });
    expect(conv(r)).toEqual([]);
    const mala = resolveTracking(vacio, { landing: { tracking: { googleAds: AW_B, googleAdsConversionLabel: 'x y' } } });
    expect(conv(mala)).toEqual([]);
    expect(mala.rejected).toContainEqual({ key: 'googleAdsConversionLabel', reason: 'formato', origen: 'landing' });
  });

  it('si el tope recorta la cuenta, su etiqueta se va con ella', () => {
    const cinco = ['AW-100000001', 'AW-100000002', 'AW-100000003', 'AW-100000004', 'AW-100000005'];
    const r = resolveTracking(site({ googleAds: cinco.join(',') }), { landing: { tracking: { googleAds: AW_B, googleAdsConversionLabel: 'LabelBBBBBB' } } });
    expect(ids(r, 'googleAds')).toEqual(cinco);
    expect(conv(r)).toEqual([]);
  });
});

describe('cableado: los DOS layouts reciben la misma landing y la página se la pasa', () => {
  const leer = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  it('BaseLayout y SiteLayout resuelven con `landing:` (misma lista en banner y cargador)', () => {
    expect(leer('../layouts/BaseLayout.astro')).toMatch(/landing: landingTracking/);
    expect(leer('../layouts/SiteLayout.astro')).toMatch(/landing: baseProps\.landingTracking/);
  });
  it('la ruta /lp/[slug] pasa el frontmatter de ESA entrada', () => {
    expect(leer('../pages/[...locale]/lp/[slug].astro')).toMatch(/landingTracking=\{\{ tracking: landing\.tracking, mode: landing\.trackingMode \}\}/);
  });
  it('el resto de rutas no pasan override (solo /lp/[slug])', () => {
    const base = new URL('../pages/', import.meta.url);
    const otras = ['index.astro', '[...locale]/index.astro', '[...locale]/lp/gracias.astro'];
    for (const f of otras) {
      try { expect(readFileSync(new URL(f, base), 'utf8')).not.toContain('landingTracking'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
  });
});

describe('extremo a extremo: el cargador real y saastroTrack de ESA página', () => {
  const fuente = readFileSync(new URL('../components/Analytics.astro', import.meta.url), 'utf8');
  const CODIGO = fuente.match(/<script is:inline[^>]*>([\s\S]*?)<\/script>/)![1];

  function pagina(r: ReturnType<typeof resolveTracking>) {
    const scripts: string[] = [];
    const insert = (s: { src?: string }) => scripts.push(s.src ?? '');
    const doc = {
      cookie: 'cookie_consent=' + encodeURIComponent(JSON.stringify({ analytics: true, marketing: true, providers: r.consentKeys })),
      readyState: 'complete',
      head: { appendChild: insert },
      getElementsByTagName: () => [{ parentNode: { insertBefore: insert } }],
      createElement: () => ({ attrs: {}, setAttribute() {} }),
      addEventListener: () => {},
    };
    const win: Record<string, any> = { document: doc, addEventListener: () => {} };
    win.window = win;
    runInNewContext(CODIGO, {
      providers: r.providers, adsConv: r.googleAdsConversions, ownHost: '', window: win, document: doc,
      location: { hostname: 'sitio.example', href: 'https://sitio.example/', origin: 'https://sitio.example' },
      history: { pushState() {}, replaceState() {} }, URL, encodeURIComponent, decodeURIComponent, JSON, Date, Array, Object,
    });
    const dl = () => (win.dataLayer as any[]).map((a) => (Object.prototype.toString.call(a) === '[object Arguments]' ? Array.from(a) : a));
    const fbqInit = () => (win.fbq?.queue ?? []).map((a: any) => Array.from(a)).filter((a: any[]) => a[0] === 'init').map((a: any[]) => a[1]);
    return { scripts, dl, win, fbqInit, track: (n: string, d?: object) => win.saastroTrack(n, d) as string[] };
  }

  const s = site({ metaPixel: META_A, googleAds: AW_A, googleAdsConversionLabel: 'LabelAAAAAA', ga4: GA_A });
  const landing: LandingTracking = { tracking: { metaPixel: META_B, googleAds: AW_B, googleAdsConversionLabel: 'LabelBBBBBB' }, mode: 'add' };

  it('add: la landing inicializa los dos píxeles de Meta y convierte en las dos cuentas', () => {
    const p = pagina(resolveTracking(s, { landing }));
    expect(p.fbqInit()).toEqual([META_A, META_B]);
    expect(p.track('generate_lead', { event_id: 'e1' })).toEqual(expect.arrayContaining(['ga4', 'googleAds', 'metaPixel']));
    const envios = p.dl().filter((a) => a[0] === 'event' && a[1] === 'conversion').map((a) => a[2].send_to);
    expect(envios).toEqual([`${AW_A}/LabelAAAAAA`, `${AW_B}/LabelBBBBBB`]);
  });

  it('replace: solo los de la landing en Meta y en Ads; GA4 sigue siendo el del site', () => {
    const p = pagina(resolveTracking(s, { landing: { ...landing, mode: 'replace' } }));
    expect(p.fbqInit()).toEqual([META_B]);
    expect(p.dl().filter((a) => a[0] === 'config').map((a) => a[1]).sort()).toEqual([AW_B, GA_A].sort());
    expect(p.dl().filter((a) => a[0] === 'event' && a[1] === 'conversion')).toEqual([]);
    p.track('generate_lead');
    // solo la cuenta de la landing con SU etiqueta; la cuenta ni la etiqueta del site
    expect(p.dl().filter((a) => a[0] === 'event' && a[1] === 'conversion').map((a) => a[2].send_to)).toEqual([`${AW_B}/LabelBBBBBB`]);
  });

  it('otra página (misma configuración, SIN landing) se ejecuta limpia: ni el píxel ni la cuenta de la landing', () => {
    resolveTracking(s, { landing });
    const p = pagina(resolveTracking(s));
    expect(p.fbqInit()).toEqual([META_A]);
    p.track('generate_lead');
    expect(p.dl().filter((a) => a[0] === 'event' && a[1] === 'conversion').map((a) => a[2].send_to)).toEqual([`${AW_A}/LabelAAAAAA`]);
    expect(p.scripts.join(' ')).not.toContain(AW_B);
  });
});

describe('navegación sin recargar (ClientRouter): el override no pasa de una página a otra', () => {
  const fuente = readFileSync(new URL('../components/Analytics.astro', import.meta.url), 'utf8');
  const CODIGO = fuente.match(/<script is:inline[^>]*>([\s\S]*?)<\/script>/)![1];

  /** Ejecuta el cargador real varias veces en la MISMA ventana, como hace ClientRouter. */
  function navegar(paginas: Array<ReturnType<typeof resolveTracking>>) {
    const scripts: string[] = [];
    let recargas = 0;
    const insert = (s: { src?: string }) => scripts.push(s.src ?? '');
    const doc = {
      cookie: '', readyState: 'complete', head: { appendChild: insert },
      getElementsByTagName: () => [{ parentNode: { insertBefore: insert } }],
      createElement: () => ({ attrs: {}, setAttribute() {} }), addEventListener: () => {},
    };
    const win: Record<string, any> = { document: doc, addEventListener: () => {} };
    win.window = win;
    for (const r of paginas) {
      runInNewContext(CODIGO, {
        providers: r.providers, adsConv: r.googleAdsConversions, ownHost: '', window: win, document: doc,
        location: { hostname: 'sitio.example', href: 'https://sitio.example/', origin: 'https://sitio.example', reload: () => { recargas++; } },
        history: { pushState() {}, replaceState() {} }, URL, encodeURIComponent, decodeURIComponent, JSON, Date, Array, Object,
      });
    }
    return { recargas, win };
  }
  const s = site({ metaPixel: META_A });
  const conLanding = resolveTracking(s, { landing: { tracking: { metaPixel: META_B }, mode: 'replace' } });
  const sin = resolveTracking(s);

  it('landing con override -> página normal: recarga (los píxeles ya vivos no se pueden descargar)', () => {
    expect(navegar([conLanding, sin]).recargas).toBe(1);
  });
  it('página normal -> landing con override: recarga', () => {
    expect(navegar([sin, conLanding]).recargas).toBe(1);
  });
  it('la misma firma (todo el site sin landings) NO recarga nunca', () => {
    expect(navegar([sin, resolveTracking(s), resolveTracking(s)]).recargas).toBe(0);
  });
  it('la segunda carga tras recargar parte de cero: sin firma previa, no vuelve a recargar', () => {
    expect(navegar([conLanding]).recargas).toBe(0);
  });
  it('al recargar, el script de la página nueva no se ejecuta a medias (no reabre el listener ni cambia la firma)', () => {
    const { win } = navegar([conLanding, sin]);
    expect(win.__saastroTrackSig).toContain(META_B);
    expect(win.__saastroTrackSig).not.toContain(META_A);
  });
});

describe('página SIN proveedores tras una landing con ellos (sin recargar)', () => {
  const fuente = readFileSync(new URL('../components/Analytics.astro', import.meta.url), 'utf8');
  const [principal, guarda] = [...fuente.matchAll(/<script is:inline[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

  function ejecutar(codigo: string, win: Record<string, any>, recargas: { n: number }, r: ReturnType<typeof resolveTracking>) {
    win.window = win;
    const doc = { cookie: '', readyState: 'complete', head: { appendChild() {} }, getElementsByTagName: () => [{ parentNode: { insertBefore() {} } }], createElement: () => ({ attrs: {}, setAttribute() {} }), addEventListener: () => {} };
    runInNewContext(codigo, {
      providers: r.providers, adsConv: r.googleAdsConversions, ownHost: '', window: win, document: doc,
      location: { hostname: 'sitio.example', href: 'https://sitio.example/', origin: 'https://sitio.example', reload: () => { recargas.n++; } },
      history: { pushState() {}, replaceState() {} }, URL, encodeURIComponent, decodeURIComponent, JSON, Date, Array, Object,
    });
  }
  const conLanding = resolveTracking(site({}), { landing: { tracking: { metaPixel: META_B } } });

  it('existe el guarda de la página sin proveedores y se renderiza solo cuando no hay ninguno', () => {
    expect(guarda).toBeTruthy();
    expect(fuente).toMatch(/providers\.length === 0 && \(\s*<script is:inline>/);
  });
  it('tras una landing con píxeles, la página sin proveedores recarga', () => {
    const win: Record<string, any> = { addEventListener: () => {} };
    const rec = { n: 0 };
    ejecutar(principal, win, rec, conLanding);
    ejecutar(guarda, win, rec, resolveTracking(site({})));
    expect(rec.n).toBe(1);
  });
  it('si nunca hubo píxeles en la ventana, no recarga (sites sin proveedores)', () => {
    const rec = { n: 0 };
    ejecutar(guarda, { addEventListener: () => {} }, rec, resolveTracking(site({})));
    expect(rec.n).toBe(0);
  });
});

describe('etiqueta de la landing sin cuenta propia', () => {
  it('avisa (antes se perdía en silencio) y no genera conversión', () => {
    const r = resolveTracking(site({ googleAds: AW_A }), { landing: { tracking: { googleAdsConversionLabel: 'LabelBBBBBB' } } });
    expect(r.googleAdsConversions).toEqual([]);
    expect(r.rejected).toContainEqual({ key: 'googleAdsConversionLabel', reason: 'sin-cuenta', origen: 'landing' });
    expect(describeRejected({ key: 'googleAdsConversionLabel', reason: 'sin-cuenta', origen: 'landing' })).toContain('IGNORADA');
  });
  it('con cuenta propia en la landing no avisa', () => {
    const r = resolveTracking(vacio, { landing: { tracking: { googleAds: AW_B, googleAdsConversionLabel: 'LabelBBBBBB' } } });
    expect(r.rejected.some((x) => x.reason === 'sin-cuenta')).toBe(false);
  });
});
