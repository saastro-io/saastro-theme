/**
 * /saastro-tracking.json: la configuración EFECTIVA que lee el Hub. Pruebas del portero: la
 * precedencia (variable > settings > legacy), los ids inválidos sin eco, noindex, el proveedor
 * exento, el orden estable y que el fichero y el cargador salen de la MISMA resolución.
 *
 * Fixtures falsos de baja entropía: ningún id de una cuenta real.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LANDING_KEYS, PROVIDERS, envVarName, resolveTracking } from './tracking';
import { serializar, trackingJson } from './tracking-efectivo';

const base = { analytics: { googleAnalytics: { id: '' }, googleTagManager: { id: '' } } };
const conTracking = (tracking: Record<string, unknown>) => ({ ...base, tracking });
const SITE = 'https://example.test';
/** 32 hex FALSOS (formato del beacon de Cloudflare); troceados para no parecer un secreto al escáner. */
const CF_FALSO = ['fedcba98', '76543210', 'fedcba98', '76543210'].join('');

const json = (settings: Parameters<typeof resolveTracking>[0], env: Record<string, unknown> = {}, noindex = false) =>
  trackingJson(resolveTracking(settings, { env, noindex }), SITE);
const de = (j: ReturnType<typeof json>, key: string) => {
  const e = j.providers.find((p) => p.key === key);
  if (!e) throw new Error(`falta ${key}`);
  return e;
};

describe('forma del fichero', () => {
  it('schema 1, siteUrl y UNA entrada por proveedor del catálogo, ordenadas por key', () => {
    const j = json(base);
    expect(j.schema).toBe(1);
    expect(j.siteUrl).toBe(SITE);
    expect(j.providers.map((p) => p.key)).toEqual(PROVIDERS.map((p) => p.key).sort());
    expect(Object.keys(j)).toEqual(['schema', 'siteUrl', 'providers']);
  });

  it('plantilla vacía: todos source none, ids vacíos, sin `invalid`', () => {
    for (const p of json(base).providers) {
      expect(p.source).toBe('none');
      expect(p.ids).toEqual([]);
      expect('invalid' in p).toBe(false);
    }
  });

  it('campos estáticos del catálogo: envVar derivada, consentRequired, perLanding', () => {
    const j = json(base);
    for (const def of PROVIDERS) expect(de(j, def.key).envVar).toBe(envVarName(def.key));
    expect(de(j, 'ga4')).toMatchObject({ label: 'Google Analytics 4', category: 'analytics', envVar: 'PUBLIC_TRACKING_GA4', consentRequired: true, perLanding: true });
    expect(de(j, 'metaPixel').envVar).toBe('PUBLIC_TRACKING_META_PIXEL');
    expect(de(j, 'clarity').perLanding).toBe(false); // del site
  });

  it('perLanding coincide con lo que el cargador deja sobrescribir a una landing (LANDING_KEYS)', () => {
    for (const p of json(base).providers) expect(p.perLanding, p.key).toBe(LANDING_KEYS.includes(p.key));
  });

  it('determinista: dos pasadas dan los MISMOS bytes y no hay marcas de tiempo', () => {
    const a = serializar(json(conTracking({ ga4: 'G-TESTAAAA01' })));
    const b = serializar(json(conTracking({ ga4: 'G-TESTAAAA01' })));
    expect(a).toBe(b);
    expect(a.endsWith('\n')).toBe(true);
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T|timestamp|generated/i);
  });
});

describe('precedencia: variable > settings > legacy', () => {
  it('variable sola: source variable y gana a settings (que no se suma)', () => {
    const j = json(conTracking({ ga4: 'G-TESTBBBB02' }), { PUBLIC_TRACKING_GA4: 'G-TESTAAAA01' });
    expect(de(j, 'ga4')).toMatchObject({ source: 'variable', ids: ['G-TESTAAAA01'] });
  });

  it('settings sin variable: source settings', () => {
    const j = json(conTracking({ ga4: 'G-TESTBBBB02' }));
    expect(de(j, 'ga4')).toMatchObject({ source: 'settings', ids: ['G-TESTBBBB02'] });
  });

  it('solo la ruta vieja: source legacy; y settings.tracking gana a legacy', () => {
    const legacy = { analytics: { googleAnalytics: { id: 'G-TESTCCCC03' }, googleTagManager: { id: '' } } };
    expect(de(json(legacy), 'ga4')).toMatchObject({ source: 'legacy', ids: ['G-TESTCCCC03'] });
    expect(de(json({ ...legacy, tracking: { ga4: 'G-TESTBBBB02' } }), 'ga4')).toMatchObject({ source: 'settings', ids: ['G-TESTBBBB02'] });
  });

  it('variable vacía o en blanco = como si no existiera (cae a settings)', () => {
    const j = json(conTracking({ ga4: 'G-TESTBBBB02' }), { PUBLIC_TRACKING_GA4: '   ' });
    expect(de(j, 'ga4').source).toBe('settings');
  });

  it('la variable de un proveedor no mueve a los demás', () => {
    const j = json(conTracking({ clarity: 'testbbbb02' }), { PUBLIC_TRACKING_GA4: 'G-TESTAAAA01' });
    expect(de(j, 'ga4').source).toBe('variable');
    expect(de(j, 'clarity').source).toBe('settings');
    expect(de(j, 'gtm').source).toBe('none');
  });

  it('varios ids: se publican validados y sin duplicados, en el orden escrito', () => {
    const j = json(base, { PUBLIC_TRACKING_GA4: 'G-TESTAAAA01, G-TESTBBBB02,G-TESTAAAA01' });
    expect(de(j, 'ga4').ids).toEqual(['G-TESTAAAA01', 'G-TESTBBBB02']);
  });
});

describe('ids inválidos: motivo sin eco del valor', () => {
  const HOSTIL = 'G-"><script>x</script>';

  it('variable inválida: ids vacíos, source variable (NO cae a settings) e invalid formato', () => {
    const j = json(conTracking({ ga4: 'G-TESTBBBB02' }), { PUBLIC_TRACKING_GA4: HOSTIL });
    expect(de(j, 'ga4')).toMatchObject({ source: 'variable', ids: [], invalid: ['formato'] });
  });

  it('el valor descartado no aparece en ninguna parte del fichero', () => {
    const txt = serializar(json(conTracking({ metaPixel: 'no-es-un-id-xyz' }), { PUBLIC_TRACKING_GA4: HOSTIL }));
    expect(txt).not.toContain('script');
    expect(txt).not.toContain('no-es-un-id-xyz');
    expect(de(json(conTracking({ metaPixel: 'no-es-un-id-xyz' })), 'metaPixel')).toMatchObject({ source: 'settings', ids: [], invalid: ['formato'] });
  });

  it('la entrada con `invalid` no lleva más campos que los del contrato', () => {
    const e = de(json(conTracking({ metaPixel: 'no-es-un-id-xyz' })), 'metaPixel');
    expect(Object.keys(e).sort()).toEqual(['category', 'consentRequired', 'envVar', 'ids', 'invalid', 'key', 'label', 'perLanding', 'source']);
    expect(Object.keys(de(json(base), 'metaPixel')).sort()).toEqual(['category', 'consentRequired', 'envVar', 'ids', 'key', 'label', 'perLanding', 'source']);
  });

  it('un id numérico sin comillas en el YAML: invalid no-cadena', () => {
    expect(de(json(conTracking({ metaPixel: 1234567890 })), 'metaPixel')).toMatchObject({ ids: [], invalid: ['no-cadena'] });
  });

  it('mezcla válido+inválido: el válido se publica y el motivo se anota', () => {
    const j = json(conTracking({ ga4: 'G-TESTAAAA01,roto' }));
    expect(de(j, 'ga4')).toMatchObject({ ids: ['G-TESTAAAA01'], invalid: ['formato'] });
  });

  it('sobre el tope del catálogo: invalid tope y se publican solo los primeros', () => {
    const j = json(base, { PUBLIC_TRACKING_CLARITY: 'testaaaa01,testbbbb02' });
    expect(de(j, 'clarity')).toMatchObject({ ids: ['testaaaa01'], invalid: ['tope'] });
  });
});

describe('noindex y proveedor exento', () => {
  it('noindex apaga todo, tal cual lo hace el cargador', () => {
    const settings = conTracking({ ga4: 'G-TESTAAAA01' });
    const j = json(settings, { PUBLIC_TRACKING_CLARITY: 'testaaaa01' }, true);
    for (const p of j.providers) expect(p).toMatchObject({ source: 'none', ids: [] });
    expect(resolveTracking(settings, { noindex: true }).providers).toEqual([]);
  });

  it('Cloudflare Web Analytics (exento): consentRequired false, perLanding false, y se publica', () => {
    const j = json(base, { PUBLIC_TRACKING_CLOUDFLARE_WEB_ANALYTICS: '0123456789abcdef0123456789abcdef' });
    expect(de(j, 'cloudflareWebAnalytics')).toMatchObject({ source: 'variable', ids: ['0123456789abcdef0123456789abcdef'], category: 'none', consentRequired: false, perLanding: false });
  });

  it('una `none` SIN motivo no es exención: pide consentimiento', () => {
    const j = trackingJson({ report: PROVIDERS.map((d) => ({ key: d.key, ids: [], source: 'none' as const, invalid: [] })) }, SITE);
    expect(de(j, 'ga4').consentRequired).toBe(true);
  });

  it('Cloudflare por la ruta vieja analytics.cloudflareWebAnalytics.token: source legacy', () => {
    const s = { ...base, analytics: { ...base.analytics, cloudflareWebAnalytics: { token: CF_FALSO } } };
    expect(de(json(s), 'cloudflareWebAnalytics')).toMatchObject({ source: 'legacy', ids: [CF_FALSO] });
  });
});

describe('el fichero y el cargador usan la MISMA resolución', () => {
  const casos: Array<[string, Parameters<typeof resolveTracking>[0], Record<string, unknown>]> = [
    ['vacío', base, {}],
    ['solo variables', base, { PUBLIC_TRACKING_GA4: 'G-TESTAAAA01', PUBLIC_TRACKING_CLARITY: 'testaaaa01', PUBLIC_TRACKING_META_PIXEL: '1111111111' }],
    ['solo settings', conTracking({ ga4: 'G-TESTBBBB02', gtm: 'GTM-TEST001', googleAds: 'AW-111111111' }), {}],
    ['mixto con inválidos', conTracking({ ga4: 'G-TESTBBBB02', metaPixel: 'xx' }), { PUBLIC_TRACKING_GA4: 'mal', PUBLIC_TRACKING_CLARITY: 'testaaaa01' }],
  ];

  it.each(casos)('%s: los ids publicados == los proveedores que carga el cargador', (_n, settings, env) => {
    const r = resolveTracking(settings, { env });
    const j = trackingJson(r, SITE);
    for (const p of j.providers) {
      expect(p.ids, p.key).toEqual(r.providers.find((x) => x.key === p.key)?.ids ?? []);
    }
  });

  it('el endpoint importa resolveTracking+getSettings (como BaseLayout) y no reimplementa precedencia', () => {
    const ep = readFileSync(new URL('../pages/saastro-tracking.json.ts', import.meta.url), 'utf8');
    const layout = readFileSync(new URL('../layouts/BaseLayout.astro', import.meta.url), 'utf8');
    for (const f of [ep, layout]) {
      expect(f).toMatch(/import \{[^}]*resolveTracking[^}]*\} from '\.\.\/lib\/tracking'/);
      expect(f).toMatch(/import \{ getSettings \} from '\.\.\/lib\/settings'/);
    }
    expect(ep).not.toMatch(/PUBLIC_TRACKING_|import\.meta\.env|settings\.tracking|\.legacy/);
    expect(ep).toMatch(/prerender = true/);
  });
});
