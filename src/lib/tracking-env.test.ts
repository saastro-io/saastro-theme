/**
 * Variables de build `PUBLIC_TRACKING_*`: lo que pone el DESPLIEGUE gana sobre
 * settings.yaml. Pruebas del portero, no del caso feliz: una variable inválida
 * apaga el proveedor (no cae a settings), una vacía no cambia nada, y los
 * nombres salen del catálogo para TODOS los proveedores.
 *
 * Fixtures falsos de baja entropía: ningún id de una cuenta real.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROVIDERS, describeRejected, envVarName, resolveTracking } from './tracking';

const base = { analytics: { googleAnalytics: { id: '' }, googleTagManager: { id: '' } } };
const conTracking = (tracking: Record<string, unknown>) => ({ ...base, tracking });

/** Un id VÁLIDO por proveedor (cumple el patrón del catálogo). */
const VALIDO: Record<string, string> = {
  ga4: 'G-TESTAAAA01',
  gtm: 'GTM-TEST001',
  googleAds: 'AW-111111111',
  metaPixel: '1111111111',
  tiktokPixel: 'TESTAAAAAAAAAAA01',
  linkedinPartnerId: '111111',
  cloudflareWebAnalytics: '0123456789abcdef0123456789abcdef',
  clarity: 'testaaaa01',
};
const OTRO_VALIDO: Record<string, string> = {
  ga4: 'G-TESTBBBB02',
  gtm: 'GTM-TEST002',
  googleAds: 'AW-222222222',
  metaPixel: '2222222222',
  tiktokPixel: 'TESTBBBBBBBBBBB02',
  linkedinPartnerId: '222222',
  cloudflareWebAnalytics: 'fedcba9876543210fedcba9876543210',
  clarity: 'testbbbb02',
};

afterEach(() => vi.unstubAllEnvs());

describe('nombre de la variable: derivado del catálogo', () => {
  it('las claves camelCase pasan a MAYÚSCULAS_Y_GUION_BAJO', () => {
    expect(envVarName('ga4')).toBe('PUBLIC_TRACKING_GA4');
    expect(envVarName('clarity')).toBe('PUBLIC_TRACKING_CLARITY');
    expect(envVarName('cloudflareWebAnalytics')).toBe('PUBLIC_TRACKING_CLOUDFLARE_WEB_ANALYTICS');
    expect(envVarName('metaPixel')).toBe('PUBLIC_TRACKING_META_PIXEL');
    expect(envVarName('googleAdsConversionLabel')).toBe('PUBLIC_TRACKING_GOOGLE_ADS_CONVERSION_LABEL');
  });

  it('el fixture cubre EXACTAMENTE los proveedores del catálogo (añadir uno al JSON obliga a añadirlo aquí)', () => {
    expect(Object.keys(VALIDO).sort()).toEqual(PROVIDERS.map((p) => p.key).sort());
    expect(Object.keys(OTRO_VALIDO).sort()).toEqual(PROVIDERS.map((p) => p.key).sort());
  });

  it('el fixture son ids válidos según el patrón del catálogo', () => {
    for (const p of PROVIDERS) {
      expect(new RegExp(p.pattern).test(VALIDO[p.key]), p.key).toBe(true);
      expect(new RegExp(p.pattern).test(OTRO_VALIDO[p.key]), p.key).toBe(true);
    }
  });

  it.each(PROVIDERS.map((p) => p.key))('%s: la variable derivada del catálogo enciende el proveedor con settings vacío', (key) => {
    const env = { [envVarName(key)]: VALIDO[key] };
    const r = resolveTracking(base, { env });
    expect(r.providers.map((p) => p.key)).toEqual([key]);
    expect(r.providers[0].id).toBe(VALIDO[key]);
    expect(r.rejected).toEqual([]);
  });

  it.each(PROVIDERS.map((p) => p.key))('%s: la variable GANA sobre settings.tracking', (key) => {
    const r = resolveTracking(conTracking({ [key]: OTRO_VALIDO[key] }), { env: { [envVarName(key)]: VALIDO[key] } });
    expect(r.providers.find((p) => p.key === key)?.ids).toEqual([VALIDO[key]]);
  });

  it('la variable de OTRO proveedor no enciende éste (el nombre es exacto)', () => {
    const r = resolveTracking(base, { env: { [envVarName('clarity')]: VALIDO.clarity } });
    expect(r.providers.map((p) => p.key)).toEqual(['clarity']);
  });
});

describe('precedencia', () => {
  it('variable no vacía > settings.tracking', () => {
    const r = resolveTracking(conTracking({ ga4: OTRO_VALIDO.ga4 }), { env: { PUBLIC_TRACKING_GA4: VALIDO.ga4 } });
    expect(r.providers[0].ids).toEqual([VALIDO.ga4]);
  });

  it('variable no vacía > ruta legacy (googleAnalytics.id y el token de Cloudflare)', () => {
    const legacy = {
      analytics: {
        googleAnalytics: { id: OTRO_VALIDO.ga4 },
        googleTagManager: { id: '' },
        cloudflareWebAnalytics: { token: OTRO_VALIDO.cloudflareWebAnalytics },
      },
    };
    const r = resolveTracking(legacy, {
      env: { PUBLIC_TRACKING_GA4: VALIDO.ga4, PUBLIC_TRACKING_CLOUDFLARE_WEB_ANALYTICS: VALIDO.cloudflareWebAnalytics },
    });
    expect(r.providers.find((p) => p.key === 'ga4')?.ids).toEqual([VALIDO.ga4]);
    expect(r.providers.find((p) => p.key === 'cloudflareWebAnalytics')?.ids).toEqual([VALIDO.cloudflareWebAnalytics]);
  });

  it('la variable va SOLA: no se suma a los ids de settings', () => {
    const r = resolveTracking(conTracking({ ga4: OTRO_VALIDO.ga4 }), { env: { PUBLIC_TRACKING_GA4: VALIDO.ga4 } });
    expect(r.providers[0].ids).toHaveLength(1);
  });

  it('los props de BaseLayout (overrides) siguen por encima de la variable', () => {
    const r = resolveTracking(base, { env: { PUBLIC_TRACKING_GA4: VALIDO.ga4 }, overrides: { googleAnalyticsId: OTRO_VALIDO.ga4 } });
    expect(r.providers[0].ids).toEqual([OTRO_VALIDO.ga4]);
  });
});

describe('variable vacía o sin definir = settings como siempre', () => {
  it.each([undefined, '', '   '])('valor %j', (v) => {
    const env = v === undefined ? {} : { PUBLIC_TRACKING_GA4: v };
    const r = resolveTracking(conTracking({ ga4: OTRO_VALIDO.ga4 }), { env });
    expect(r.providers[0].ids).toEqual([OTRO_VALIDO.ga4]);
    expect(r.rejected).toEqual([]);
  });

  it('sin variables ni settings, nada encendido', () => {
    expect(resolveTracking(base, { env: {} }).providers).toEqual([]);
  });

  it('el valor por defecto de env es import.meta.env (vi.stubEnv)', () => {
    vi.stubEnv('PUBLIC_TRACKING_GA4', VALIDO.ga4);
    expect(resolveTracking(base).providers[0].ids).toEqual([VALIDO.ga4]);
  });
});

describe('variable inválida: se descarta con aviso y NO cae a settings', () => {
  it('formato inválido: proveedor APAGADO aunque settings tenga un id válido', () => {
    const r = resolveTracking(conTracking({ ga4: OTRO_VALIDO.ga4 }), { env: { PUBLIC_TRACKING_GA4: 'no-es-un-id' } });
    expect(r.providers).toEqual([]);
    expect(r.rejected).toEqual([{ key: 'ga4', reason: 'formato', origen: 'env' }]);
  });

  it('el aviso nombra la variable y dice que no se usa settings', () => {
    const msg = describeRejected({ key: 'cloudflareWebAnalytics', reason: 'formato', origen: 'env' });
    expect(msg).toContain('PUBLIC_TRACKING_CLOUDFLARE_WEB_ANALYTICS');
    expect(msg).toContain('APAGADO');
    expect(msg).toContain('settings.tracking.cloudflareWebAnalytics');
  });

  it('un valor que no es cadena en la variable se descarta (no cae a settings)', () => {
    const r = resolveTracking(conTracking({ ga4: OTRO_VALIDO.ga4 }), { env: { PUBLIC_TRACKING_GA4: 12345 } });
    expect(r.providers).toEqual([]);
    expect(r.rejected[0]).toMatchObject({ key: 'ga4', origen: 'env' });
  });

  it('hostil (inyección) no se inyecta: se descarta', () => {
    const r = resolveTracking(base, { env: { PUBLIC_TRACKING_CLARITY: '";alert(1)//' } });
    expect(r.providers).toEqual([]);
    expect(r.rejected).toHaveLength(1);
  });

  it('con varios ids, el inválido se descarta y el válido se queda', () => {
    const r = resolveTracking(base, { env: { PUBLIC_TRACKING_GA4: `${VALIDO.ga4}, malo ,${OTRO_VALIDO.ga4}` } });
    expect(r.providers[0].ids).toEqual([VALIDO.ga4, OTRO_VALIDO.ga4]);
    expect(r.rejected).toEqual([{ key: 'ga4', reason: 'formato', origen: 'env' }]);
  });

  it('tope: Clarity admite 1 id; el resto se descarta con aviso de la variable', () => {
    const r = resolveTracking(base, { env: { PUBLIC_TRACKING_CLARITY: `${VALIDO.clarity},${OTRO_VALIDO.clarity}` } });
    expect(r.providers[0].ids).toEqual([VALIDO.clarity]);
    expect(r.rejected).toEqual([{ key: 'clarity', reason: 'tope', max: 1, origen: 'env' }]);
  });

  it('varios ids por variable: se deduplican y respetan el tope del catálogo (ga4: 5)', () => {
    const muchos = Array.from({ length: 7 }, (_, i) => `G-TEST${String(i).padStart(4, '0')}A`).join(',');
    const r = resolveTracking(base, { env: { PUBLIC_TRACKING_GA4: muchos } });
    expect(r.providers[0].ids).toHaveLength(5);
    expect(r.rejected[0]).toMatchObject({ key: 'ga4', reason: 'tope', origen: 'env' });
  });
});

describe('etiqueta de conversión de Google Ads por variable', () => {
  const ETIQUETA = 'TESTlabel01';
  const OTRA = 'TESTlabel02';

  it('la variable PUBLIC_TRACKING_GOOGLE_ADS_CONVERSION_LABEL gana sobre settings', () => {
    const r = resolveTracking(conTracking({ googleAdsConversionLabel: OTRA }), {
      env: { PUBLIC_TRACKING_GOOGLE_ADS: VALIDO.googleAds, PUBLIC_TRACKING_GOOGLE_ADS_CONVERSION_LABEL: ETIQUETA },
    });
    expect(r.googleAdsConversions).toEqual([{ id: VALIDO.googleAds, label: ETIQUETA }]);
  });

  it('vacía = la de settings', () => {
    const r = resolveTracking(conTracking({ googleAds: VALIDO.googleAds, googleAdsConversionLabel: OTRA }), { env: {} });
    expect(r.googleAdsConversions).toEqual([{ id: VALIDO.googleAds, label: OTRA }]);
  });

  it('inválida: se descarta y NO cae a la de settings', () => {
    const r = resolveTracking(conTracking({ googleAds: VALIDO.googleAds, googleAdsConversionLabel: OTRA }), {
      env: { PUBLIC_TRACKING_GOOGLE_ADS_CONVERSION_LABEL: 'x' },
    });
    expect(r.googleAdsConversions).toEqual([]);
    expect(r.rejected).toEqual([{ key: 'googleAdsConversionLabel', reason: 'formato', origen: 'env' }]);
  });
});

describe('consentimiento con ids por variable', () => {
  it('Cloudflare por variable sigue exento (no entra en consentKeys) y GA4/Clarity sí piden consentimiento', () => {
    const r = resolveTracking(base, {
      env: {
        PUBLIC_TRACKING_GA4: VALIDO.ga4,
        PUBLIC_TRACKING_CLARITY: VALIDO.clarity,
        PUBLIC_TRACKING_CLOUDFLARE_WEB_ANALYTICS: VALIDO.cloudflareWebAnalytics,
      },
    });
    expect(r.consentKeys.sort()).toEqual(['clarity', 'ga4']);
    expect(r.providers.find((p) => p.key === 'cloudflareWebAnalytics')?.category).toBe('none');
  });

  it('noindex apaga también lo que viene de variables', () => {
    expect(resolveTracking(base, { noindex: true, env: { PUBLIC_TRACKING_GA4: VALIDO.ga4 } }).providers).toEqual([]);
  });
});
