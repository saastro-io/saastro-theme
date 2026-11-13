/**
 * Cloudflare Web Analytics dentro del catálogo (CON consentimiento de analítica
 * desde el 13-nov-2026; antes figuraba exento por una decisión del theme que nunca
 * se verificó) y varios ids por proveedor. Lo que importa: la exención, si algún día
 * hay una, es EXPLÍCITA (categoría + motivo) y se prueba con un proveedor sintético;
 * lo que pide consentimiento entra en las claves de consentimiento; y cada id de una
 * lista pasa por el patrón del proveedor antes de llegar a una URL o a código inline.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PROVIDERS, isExempt, resolveTracking } from './tracking';

const base = { analytics: { googleAnalytics: { id: '' }, googleTagManager: { id: '' } } };
const CF = 'c0ffee00c0ffee00c0ffee00c0ffee00';
const OTRO = '0123456789abcdef0123456789abcdef';
const legadoCF = (token: string) => ({
  analytics: { googleAnalytics: { id: '' }, googleTagManager: { id: '' }, cloudflareWebAnalytics: { token } },
});

describe('Cloudflare Web Analytics en el catálogo (con consentimiento de analítica)', () => {
  it('el token de producción cumple el patrón del catálogo y los mal formados no', () => {
    const def = PROVIDERS.find((p) => p.key === 'cloudflareWebAnalytics')!;
    const re = new RegExp(def.pattern);
    expect(re.test(CF)).toBe(true);
    expect(re.test(CF.slice(1))).toBe(false); // 31
    expect(re.test(CF + '0')).toBe(false); // 33
    expect(re.test('g' + CF.slice(1))).toBe(false); // no hex
  });

  it('NO es exento: pide consentimiento de analítica y lleva ancla en la política', () => {
    const def = PROVIDERS.find((p) => p.key === 'cloudflareWebAnalytics')! as { exemptReason?: string; marker?: string; category: string };
    expect(def.category).toBe('analytics');
    expect(def.exemptReason).toBeUndefined();
    expect(def.marker).toBe('tracking-cloudflare');
    expect(isExempt(def as never)).toBe(false);
  });

  it('el mecanismo de exención exige categoría none Y motivo escrito (proveedor sintético)', () => {
    expect(isExempt({ category: 'none', exemptReason: 'motivo escrito' })).toBe(true);
    expect(isExempt({ category: 'none' })).toBe(false); // sin motivo no es exención
    expect(isExempt({ category: 'none', exemptReason: '  ' })).toBe(false);
    expect(isExempt({ category: 'analytics', exemptReason: 'x' })).toBe(false); // el motivo solo no basta
  });

  it('el catálogo no tiene ningún exento sin motivo ni ningún proveedor con consentimiento sin ancla', () => {
    for (const p of PROVIDERS) {
      if (p.category === 'none') expect(isExempt(p), `${p.key}: category none sin exemptReason`).toBe(true);
      else expect(p.marker, `${p.key}: falta el marcador de la política`).toMatch(/^tracking-/);
    }
  });

  it('la ruta vieja analytics.cloudflareWebAnalytics.token sigue funcionando', () => {
    const r = resolveTracking(legadoCF(CF));
    expect(r.providers).toEqual([{ key: 'cloudflareWebAnalytics', id: CF, ids: [CF], category: 'analytics' }]);
  });

  it('tracking.cloudflareWebAnalytics gana a la ruta vieja si ambos existen', () => {
    const r = resolveTracking({ ...legadoCF(CF), tracking: { cloudflareWebAnalytics: OTRO } });
    expect(r.providers[0].ids).toEqual([OTRO]);
  });

  it('un valor nuevo inválido NO cae en silencio a la ruta vieja: se descarta con aviso', () => {
    const r = resolveTracking({ ...legadoCF(CF), tracking: { cloudflareWebAnalytics: 'no-es-un-token' } });
    expect(r.providers).toEqual([]);
    expect(r.rejected).toContainEqual({ key: 'cloudflareWebAnalytics', reason: 'formato' });
  });

  it('un token mal formado en la ruta vieja se descarta (no llega al HTML)', () => {
    const r = resolveTracking(legadoCF('"><script>alert(1)</script>'));
    expect(r.providers).toEqual([]);
    expect(r.rejected).toContainEqual({ key: 'cloudflareWebAnalytics', reason: 'formato' });
  });

  it('un token numérico sin comillas en la ruta nueva se avisa como no-cadena', () => {
    const r = resolveTracking({ ...base, tracking: { cloudflareWebAnalytics: 12345678 as unknown as string } });
    expect(r.rejected).toContainEqual({ key: 'cloudflareWebAnalytics', reason: 'no-cadena' });
  });

  it('noindex lo apaga como a todos (la URL de un borrador lleva un token)', () => {
    const r = resolveTracking(legadoCF(CF), { noindex: true });
    expect(r.providers).toEqual([]);
    expect(r.consentKeys).toEqual([]);
  });

  it('ENTRA en consentKeys (analítica), NO enciende el banner de marketing y convive con los demás', () => {
    const solo = resolveTracking(legadoCF(CF));
    expect(solo.consentKeys).toEqual(['cloudflareWebAnalytics']);
    expect(solo.showMarketing).toBe(false);
    const con = resolveTracking({ ...legadoCF(CF), tracking: { ga4: 'G-ABC123XYZ9', metaPixel: '1234567890123' } });
    expect(con.providers.map((p) => p.key).sort()).toEqual(['cloudflareWebAnalytics', 'ga4', 'metaPixel']);
    expect(con.consentKeys.sort()).toEqual(['cloudflareWebAnalytics', 'ga4', 'metaPixel']);
    expect(con.showMarketing).toBe(true);
  });

  it('con una lista de tokens usa el primero y avisa (un beacon por página)', () => {
    const r = resolveTracking({ ...base, tracking: { cloudflareWebAnalytics: `${CF}, ${OTRO}` } });
    expect(r.providers[0].ids).toEqual([CF]);
    expect(r.rejected).toContainEqual({ key: 'cloudflareWebAnalytics', reason: 'tope', max: 1 });
  });
});

describe('mecanismo de exención en el resolvedor (proveedor SINTÉTICO: el catálogo real no tiene ninguno)', () => {
  const SINTETICO = { key: 'sintetico', label: 'Sintético', category: 'none', exemptReason: 'motivo de prueba', pattern: '^[a-z]{4}$', maxIds: 1 };
  const con = (fn: () => void) => {
    PROVIDERS.push(SINTETICO as never);
    try { fn(); } finally { PROVIDERS.splice(PROVIDERS.indexOf(SINTETICO as never), 1); }
  };

  it('un exento con motivo conserva category none, NO entra en consentKeys y no enciende el banner de marketing', () => {
    con(() => {
      const r = resolveTracking({ ...base, tracking: { sintetico: 'abcd', ga4: 'G-ABC123XYZ9' } });
      expect(r.providers.find((p) => p.key === 'sintetico')?.category).toBe('none');
      expect(r.consentKeys).toEqual(['ga4']); // si el exento entrara, todos los que ya consintieron volverían a ver el banner
      expect(r.showMarketing).toBe(false);
    });
  });

  it('el mismo proveedor sin motivo se resuelve como analytics y SÍ entra en consentKeys', () => {
    con(() => {
      const { exemptReason: _, ...sinMotivo } = SINTETICO;
      PROVIDERS.splice(PROVIDERS.indexOf(SINTETICO as never), 1, sinMotivo as never);
      try {
        const r = resolveTracking({ ...base, tracking: { sintetico: 'abcd' } });
        expect(r.providers.find((p) => p.key === 'sintetico')?.category).toBe('analytics');
        expect(r.consentKeys).toEqual(['sintetico']);
      } finally {
        PROVIDERS.splice(PROVIDERS.indexOf(sinMotivo as never), 1, SINTETICO as never);
      }
    });
  });
});

describe('fail-closed del catálogo', () => {
  it('una categoría none sin exemptReason se resuelve como analytics (pide consentimiento y entra en consentKeys)', () => {
    // Se fuerza la forma del catálogo viejo (none, sin motivo) sobre un proveedor real para
    // probar el mecanismo: una exención a medias NO exime.
    const def = PROVIDERS.find((p) => p.key === 'cloudflareWebAnalytics') as { category: string; exemptReason?: string };
    const categoria = def.category;
    try {
      def.category = 'none';
      delete def.exemptReason;
      const r = resolveTracking(legadoCF(CF));
      expect(r.providers[0].category).toBe('analytics');
      expect(r.consentKeys).toEqual(['cloudflareWebAnalytics']);
    } finally {
      def.category = categoria;
    }
  });
});

describe('varios ids por proveedor (lista separada por comas)', () => {
  const lista = (tracking: Record<string, unknown>) => resolveTracking({ ...base, tracking });

  it('un solo id se comporta como siempre (id == ids[0], sin avisos)', () => {
    const r = lista({ ga4: 'G-ABC123XYZ9' });
    expect(r.providers).toEqual([{ key: 'ga4', id: 'G-ABC123XYZ9', ids: ['G-ABC123XYZ9'], category: 'analytics' }]);
    expect(r.rejected).toEqual([]);
  });

  it('parte por comas, recorta espacios y saltos de línea y conserva el orden escrito', () => {
    const r = lista({ ga4: ' G-AAAAAA0001 ,G-BBBBBB0002,\nG-CCCCCC0003 ' });
    expect(r.providers[0].ids).toEqual(['G-AAAAAA0001', 'G-BBBBBB0002', 'G-CCCCCC0003']);
    expect(r.providers[0].id).toBe('G-AAAAAA0001');
  });

  it('valida CADA id: descarta con aviso solo el malo y conserva el bueno', () => {
    const r = lista({ metaPixel: "1234567890123, 123');alert(1);//, 9876543210987" });
    expect(r.providers[0].ids).toEqual(['1234567890123', '9876543210987']);
    expect(r.rejected).toEqual([{ key: 'metaPixel', reason: 'formato' }]);
  });

  it('si TODOS son inválidos el proveedor queda apagado', () => {
    const r = lista({ ga4: 'UA-1, G-x' });
    expect(r.providers).toEqual([]);
    expect(r.rejected).toHaveLength(2);
  });

  it('deduplica sin avisar', () => {
    const r = lista({ ga4: 'G-AAAAAA0001,G-AAAAAA0001, G-BBBBBB0002,G-AAAAAA0001' });
    expect(r.providers[0].ids).toEqual(['G-AAAAAA0001', 'G-BBBBBB0002']);
    expect(r.rejected).toEqual([]);
  });

  it('ignora comas sobrantes y huecos', () => {
    expect(lista({ ga4: ',G-AAAAAA0001,,' }).providers[0].ids).toEqual(['G-AAAAAA0001']);
    expect(lista({ ga4: ' , ' }).providers).toEqual([]);
  });

  it('tope de 5 ids por defecto: usa los 5 primeros y avisa', () => {
    const ids = Array.from({ length: 7 }, (_, i) => `G-ABCDEF000${i}`);
    const r = lista({ ga4: ids.join(',') });
    expect(r.providers[0].ids).toEqual(ids.slice(0, 5));
    expect(r.rejected).toEqual([{ key: 'ga4', reason: 'tope', max: 5 }]);
    expect(lista({ ga4: ids.slice(0, 5).join(',') }).rejected).toEqual([]); // exactamente 5: sin aviso
  });

  it('el tope cuenta ids VÁLIDOS y distintos (los inválidos y repetidos no gastan plaza)', () => {
    const r = lista({ ga4: 'G-AAAAAA0001,mal,G-AAAAAA0001,G-BBBBBB0002,G-CCCCCC0003,G-DDDDDD0004,G-EEEEEE0005' });
    expect(r.providers[0].ids).toHaveLength(5);
    expect(r.rejected).toEqual([{ key: 'ga4', reason: 'formato' }]);
  });

  it('Clarity: UN solo proyecto por página. Con lista usa el primero y avisa (no apaga la grabación)', () => {
    const r = lista({ clarity: 'abcdefgh12,zzzzzzzz99' });
    expect(r.providers[0].ids).toEqual(['abcdefgh12']);
    expect(r.rejected).toEqual([{ key: 'clarity', reason: 'tope', max: 1 }]);
  });

  it('la lista sirve para todos los proveedores multi-id', () => {
    const r = lista({
      gtm: 'GTM-AAAA111,GTM-BBBB222',
      googleAds: 'AW-123456789,AW-987654321',
      tiktokPixel: 'ABCDEFGHIJ12345,KLMNOPQRST67890',
      linkedinPartnerId: '1234567,7654321',
    });
    expect(r.providers.map((p) => [p.key, p.ids.length])).toEqual([
      ['gtm', 2],
      ['googleAds', 2],
      ['tiktokPixel', 2],
      ['linkedinPartnerId', 2],
    ]);
  });

  it('la prop de BaseLayout (override) también admite lista y gana al bloque tracking', () => {
    const r = resolveTracking(
      { ...base, tracking: { ga4: 'G-NUEVO00001' } },
      { overrides: { googleAnalyticsId: 'G-PROP000001, G-PROP000002' } },
    );
    expect(r.providers[0].ids).toEqual(['G-PROP000001', 'G-PROP000002']);
  });

  it('el legado analytics.googleAnalytics.id también admite lista', () => {
    const r = resolveTracking({
      analytics: { googleAnalytics: { id: 'G-LEGACY0001,G-LEGACY0002' }, googleTagManager: { id: '' } },
    });
    expect(r.providers[0].ids).toEqual(['G-LEGACY0001', 'G-LEGACY0002']);
  });

  it('consentKeys lleva una clave por proveedor, no por id', () => {
    expect(lista({ ga4: 'G-AAAAAA0001,G-BBBBBB0002' }).consentKeys).toEqual(['ga4']);
  });
});

describe('etiquetas de conversión de Google Ads con varias cuentas', () => {
  const lista = (tracking: Record<string, unknown>) => resolveTracking({ ...base, tracking });
  const A = 'AW-111111111';
  const B = 'AW-222222222';

  it('una etiqueta con varias cuentas va con la PRIMERA (la etiqueta pertenece a una cuenta)', () => {
    const r = lista({ googleAds: `${A},${B}`, googleAdsConversionLabel: 'AbCdEfGhIj_k' });
    expect(r.googleAdsConversions).toEqual([{ id: A, label: 'AbCdEfGhIj_k' }]);
    expect(r.googleAdsConversionLabel).toBe('AbCdEfGhIj_k');
  });

  it('etiquetas en el mismo orden que las cuentas', () => {
    const r = lista({ googleAds: `${A},${B}`, googleAdsConversionLabel: 'AbCdEfGhIj_k, LmNoPqRsTu_v' });
    expect(r.googleAdsConversions).toEqual([
      { id: A, label: 'AbCdEfGhIj_k' },
      { id: B, label: 'LmNoPqRsTu_v' },
    ]);
  });

  it('un hueco deja a esa cuenta sin conversión', () => {
    const r = lista({ googleAds: `${A},${B}`, googleAdsConversionLabel: ',LmNoPqRsTu_v' });
    expect(r.googleAdsConversions).toEqual([{ id: B, label: 'LmNoPqRsTu_v' }]);
    expect(r.googleAdsConversionLabel).toBe('LmNoPqRsTu_v');
  });

  it('una etiqueta inválida se descarta con aviso y no desplaza a las demás', () => {
    const r = lista({ googleAds: `${A},${B}`, googleAdsConversionLabel: 'x y,LmNoPqRsTu_v' });
    expect(r.googleAdsConversions).toEqual([{ id: B, label: 'LmNoPqRsTu_v' }]);
    expect(r.rejected).toContainEqual({ key: 'googleAdsConversionLabel', reason: 'formato' });
  });

  it('sin googleAds no hay conversiones', () => {
    expect(lista({ googleAdsConversionLabel: 'AbCdEfGhIj_k' }).googleAdsConversions).toEqual([]);
  });
});

describe('un único cargador', () => {
  const SRC = fileURLToPath(new URL('..', import.meta.url));
  const recorrer = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? recorrer(join(dir, e.name)) : [join(dir, e.name)],
    );
  const fuentes = recorrer(SRC).filter((f) => /\.(astro|tsx?|jsx?|mjs)$/.test(f) && !/\.test\./.test(f));

  it('el beacon de Cloudflare solo se carga desde Analytics.astro (ni BaseLayout ni nadie más)', () => {
    const conBeacon = fuentes.filter((f) => /beacon\.min\.js|data-cf-beacon/.test(readFileSync(f, 'utf8')));
    expect(conBeacon.map((f) => f.slice(SRC.length))).toEqual(['components/Analytics.astro']);
  });

  it('BaseLayout ya no lee analytics.cloudflareWebAnalytics por su cuenta', () => {
    const base = readFileSync(join(SRC, 'layouts/BaseLayout.astro'), 'utf8');
    expect(base).not.toMatch(/cloudflareWebAnalytics\??\.token/);
  });

  it('el banner y GenTracking reciben consentKeys, no la lista entera de proveedores', () => {
    const base = readFileSync(join(SRC, 'layouts/BaseLayout.astro'), 'utf8');
    const site = readFileSync(join(SRC, 'layouts/SiteLayout.astro'), 'utf8');
    expect(base).toMatch(/trackingKeys=\{tracking\.consentKeys\}/);
    expect(site).toMatch(/trackingKeys=\{consentKeys\}/);
    expect(base + site).not.toMatch(/providers\.map\(\(p\) => p\.key\)/);
  });
});
