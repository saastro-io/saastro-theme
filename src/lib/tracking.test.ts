/**
 * Qué proveedores se encienden y con qué ids. Lo importante no es el caso feliz:
 * es que un id mal formado NUNCA llegue a una URL o a código inline, que noindex
 * lo apague todo y que el banner solo ofrezca «marketing» si hay algo detrás.
 */
import { describe, expect, it } from 'vitest';
import { PROVIDERS, resolveTracking } from './tracking';

const base = { analytics: { googleAnalytics: { id: '' }, googleTagManager: { id: '' } } };

describe('resolveTracking', () => {
  it('sin ids no hay nada y el banner no ofrece marketing', () => {
    const r = resolveTracking(base);
    expect(r.providers).toEqual([]);
    expect(r.showMarketing).toBe(false);
  });

  it('lee el legado analytics.* y el bloque tracking.*', () => {
    const r = resolveTracking({
      analytics: { googleAnalytics: { id: 'G-ABC123XYZ9' }, googleTagManager: { id: '' } },
      tracking: { metaPixel: '1234567890123', clarity: 'abcdefgh12' },
    });
    expect(r.providers.map((p) => p.key).sort()).toEqual(['clarity', 'ga4', 'metaPixel']);
    expect(r.showMarketing).toBe(true); // Meta es marketing
  });

  it('tracking.ga4 gana al legado, y la prop de BaseLayout gana a ambos', () => {
    const s = { analytics: { googleAnalytics: { id: 'G-LEGACY0001' }, googleTagManager: { id: '' } }, tracking: { ga4: 'G-NUEVO00001' } };
    expect(resolveTracking(s).providers[0].id).toBe('G-NUEVO00001');
    expect(resolveTracking(s, { overrides: { googleAnalyticsId: 'G-PROP0000001' } }).providers[0].id).toBe('G-PROP0000001');
  });

  it('un id con formato malo se descarta y se anota, no se inyecta', () => {
    const r = resolveTracking({ ...base, tracking: { metaPixel: "123');alert(1);//", ga4: 'UA-1' } });
    expect(r.providers).toEqual([]);
    expect(r.rejected.map((x) => x.key).sort()).toEqual(['ga4', 'metaPixel']);
  });

  it('noindex (vista previa de un borrador) apaga TODO', () => {
    const r = resolveTracking({ ...base, tracking: { ga4: 'G-ABC123XYZ9', metaPixel: '1234567890123' } }, { noindex: true });
    expect(r.providers).toEqual([]);
    expect(r.showMarketing).toBe(false);
  });

  it('solo analytics → el banner NO ofrece marketing', () => {
    const r = resolveTracking({ ...base, tracking: { ga4: 'G-ABC123XYZ9', clarity: 'abcdefgh12' } });
    expect(r.showMarketing).toBe(false);
  });

  it('GTM cuenta como marketing posible (un contenedor puede llevar anuncios)', () => {
    expect(resolveTracking({ ...base, tracking: { gtm: 'GTM-ABCD123' } }).showMarketing).toBe(true);
  });

  it('la etiqueta de conversión solo vale con Google Ads y formato válido', () => {
    const conAds = resolveTracking({ ...base, tracking: { googleAds: 'AW-123456789', googleAdsConversionLabel: 'AbCdEfGhIj_k' } });
    expect(conAds.googleAdsConversionLabel).toBe('AbCdEfGhIj_k');
    expect(resolveTracking({ ...base, tracking: { googleAdsConversionLabel: 'AbCdEfGhIj_k' } }).googleAdsConversionLabel).toBe('');
    const mala = resolveTracking({ ...base, tracking: { googleAds: 'AW-123456789', googleAdsConversionLabel: 'x y' } });
    expect(mala.googleAdsConversionLabel).toBe('');
    expect(mala.rejected.map((x) => x.key)).toContain('googleAdsConversionLabel');
  });

  it('un id numérico SIN comillas en el YAML se descarta con aviso, no se apaga en silencio', () => {
    const r = resolveTracking({ ...base, tracking: { metaPixel: 1234567890123456 as unknown as string } });
    expect(r.providers).toEqual([]);
    expect(r.rejected).toContainEqual({ key: 'metaPixel', reason: 'no-cadena' });
  });

  it('una etiqueta de conversión que YAML lee como número también se avisa', () => {
    const r = resolveTracking({ ...base, tracking: { googleAds: 'AW-123456789', googleAdsConversionLabel: 1234567890 as unknown as string } });
    expect(r.googleAdsConversionLabel).toBe('');
    expect(r.rejected).toContainEqual({ key: 'googleAdsConversionLabel', reason: 'no-cadena' });
  });

  it('todos los patrones del catálogo compilan y cada proveedor tiene marcador único', () => {
    for (const p of PROVIDERS) expect(() => new RegExp(p.pattern)).not.toThrow();
    expect(new Set(PROVIDERS.map((p) => p.marker)).size).toBe(PROVIDERS.length);
  });
});
