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

describe('docs/guia-pixeles.md ↔ tracking-providers.json', () => {
  for (const p of catalogo.providers) {
    it(`${p.key}: tiene sección, su categoría y su patrón de id tal cual está en el catálogo`, () => {
      expect(guia, `falta la clave \`${p.key}\``).toContain('`' + p.key + '`');
      expect(guia, `falta el patrón ${p.pattern}`).toContain(p.pattern);
    });
  }
  it('la etiqueta de conversión de Google Ads también está documentada con su patrón', () => {
    expect(guia).toContain('googleAdsConversionLabel');
    expect(guia).toContain(catalogo.googleAdsConversionLabelPattern);
  });
  it('lo no verificado figura como tal (SIN VERIFICAR)', () => {
    expect(guia).toMatch(/SIN VERIFICAR/);
  });
  it('avisa de que los ids NO van en el settings.yaml del theme', () => {
    expect(guia).toMatch(/No\*\* en el `settings\.yaml` del propio \*\*theme\*\*/);
  });
});

describe('.gitattributes protege settings.yaml', () => {
  it('src/data/settings.yaml es merge=ours (una línea propia, no un comentario)', () => {
    expect(attrs).toMatch(/^src\/data\/settings\.yaml merge=ours$/m);
  });
});
