/**
 * La guía de píxeles (docs/guia-pixeles.md) y el catálogo (tracking-providers.json) no
 * pueden separarse: un proveedor nuevo sin su sección de guía, o un patrón de id que
 * cambia sin que la guía lo diga, deja a quien monta un site con una guía que miente.
 * Y `settings.yaml` tiene que estar protegido con merge=ours para que los ids que el
 * Hub escribe en el theme no se copien a los descendientes.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import catalogo from './tracking-providers.json';

const raiz = new URL('../../', import.meta.url);
const guia = readFileSync(new URL('docs/guia-pixeles.md', raiz), 'utf8');
const attrs = readFileSync(new URL('.gitattributes', raiz), 'utf8');

/** La sección `## …` de la guía que nombra a este proveedor por su clave. */
function seccion(clave: string): string {
  const s = guia.split(/\n(?=## )/).find((t) => t.startsWith('## ') && t.includes('`' + clave + '`'));
  return s ?? '';
}
const ETIQUETA_CATEGORIA: Record<string, RegExp> = {
  analytics: /categoría `analytics`(?! \*\*o\*\*)/,
  marketing: /categoría `marketing`/,
  any: /categoría `analytics` \*\*o\*\* `marketing`/,
  none: /categoría `none` \(exento de consentimiento\)/,
};

describe('docs/guia-pixeles.md ↔ tracking-providers.json', () => {
  it('el catálogo no está vacío (si lo estuviera, los tests de abajo no existirían y pasaría en verde)', () => {
    expect(catalogo.providers.length).toBeGreaterThanOrEqual(7);
  });
  for (const p of catalogo.providers) {
    it(`${p.key}: su sección lleva el patrón de id y la categoría tal cual están en el catálogo`, () => {
      const sec = seccion(p.key);
      expect(sec, `falta una sección \`## …\` que nombre \`${p.key}\``).not.toBe('');
      expect(sec, `falta el patrón ${p.pattern} en la sección de ${p.key}`).toContain(p.pattern);
      expect(sec, `la categoría de ${p.key} (${p.category}) no coincide con la guía`).toMatch(ETIQUETA_CATEGORIA[p.category]);
    });
  }
  it('la etiqueta de conversión de Google Ads también está documentada con su patrón', () => {
    expect(guia).toContain('googleAdsConversionLabel');
    expect(guia).toContain(catalogo.googleAdsConversionLabelPattern);
  });
  it('lo no verificado figura como tal (SIN VERIFICAR)', () => {
    expect(guia).toMatch(/SIN VERIFICAR/);
  });
  it('dice que el settings.yaml del theme va SIN ids (los de theme.saastro.io van en variables de build) y que los de un cliente nunca van ahí', () => {
    expect(guia).toMatch(/va SIN ids de medición/);
    expect(guia).toMatch(/viven en las variables de\s+build de su despliegue/);
    expect(guia).toMatch(/\*\*nunca\*\* se ponen en el repo del theme/);
  });
  it('lista TODAS las variables de build derivadas del catálogo y la de WhatsApp', () => {
    for (const p of catalogo.providers) {
      const nombre = 'PUBLIC_TRACKING_' + p.key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
      expect(guia, nombre).toContain('`' + nombre + '`');
    }
    expect(guia).toContain('`PUBLIC_TRACKING_GOOGLE_ADS_CONVERSION_LABEL`');
    expect(guia).toContain('`PUBLIC_WHATSAPP_NUMBER`');
  });
  it('documenta que HOY no hay proveedor exento y que Cloudflare pide consentimiento y ancla (sin inventar texto legal)', () => {
    expect(guia).toMatch(/Nada carga sin consentimiento\./);
    expect(guia).toMatch(/no hay ningún proveedor exento/);
    expect(guia).toMatch(/Cloudflare Web Analytics[^\n]*categoría `analytics`/);
    const legal = readFileSync(new URL('docs/legal-marketing.md', raiz), 'utf8');
    expect(legal).toMatch(/data-legal="tracking-cloudflare"/);
    expect(legal).toMatch(/Texto final: JC/);
    expect(legal).not.toMatch(/exento de consentimiento, SIN ancla/);
  });
  it('documenta los varios ids (tope, Clarity) y el override por landing con su contrato', () => {
    expect(guia).toMatch(/separados\s+por comas/);
    expect(guia).toMatch(/tope de 5/);
    expect(guia).toMatch(/Clarity[^\n]*un solo proyecto por página/i);
    expect(guia).toMatch(/## Override de píxeles por landing/);
    expect(guia).not.toMatch(/NO implementado/);
    expect(guia).toMatch(/trackingMode: add/);
    expect(guia).toMatch(/src\/content\/lp\/<slug>\.md/);
    expect(guia).toMatch(/replace/);
  });
  it('no afirma que Consent Mode limite TODAS las etiquetas de un contenedor GTM', () => {
    expect(guia).not.toMatch(/Consent Mode limita lo que cada etiqueta puede hacer/);
    expect(guia).toMatch(/solo gobierna las etiquetas de\s+Google que lo respetan/);
  });
});

describe('.gitattributes protege settings.yaml', () => {
  it('src/data/settings.yaml es merge=ours (una línea propia, no un comentario)', () => {
    expect(attrs).toMatch(/^src\/data\/settings\.yaml merge=ours$/m);
  });
  it('ninguna otra línea de atributos sobre settings.yaml la anula (`-merge`, otro driver)', () => {
    const lineas = attrs.split('\n').filter((l) => !l.trim().startsWith('#') && l.includes('settings.yaml'));
    expect(lineas).toEqual(['src/data/settings.yaml merge=ours']);
  });
  it('CLAUDE.md lista settings.yaml entre lo que va con merge=ours', () => {
    const claude = readFileSync(new URL('CLAUDE.md', raiz), 'utf8');
    expect(claude).toMatch(/config del site\*\* `src\/data\/settings\.yaml`/);
  });
});
