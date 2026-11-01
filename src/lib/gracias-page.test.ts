/**
 * La página de gracias no puede romper dos promesas: (1) que la medición SIGA
 * viva (los píxeles de conversión por URL la necesitan) mientras la página no se
 * indexa, y (2) que no cuente la conversión una segunda vez.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pagina = readFileSync(new URL('../pages/[...locale]/lp/gracias.astro', import.meta.url), 'utf8');
const base = readFileSync(new URL('../layouts/BaseLayout.astro', import.meta.url), 'utf8');

describe('/lp/gracias', () => {
  it('no se indexa pero NO usa `noindex` (que apagaría los píxeles): usa indexable={false}', () => {
    expect(pagina).toMatch(/indexable=\{false\}/);
    expect(pagina).not.toMatch(/\snoindex[=\s{]/);
  });
  it('lleva X-Robots-Tag noindex y no se cachea', () => {
    expect(pagina).toContain("'X-Robots-Tag', 'noindex, follow'");
    expect(pagina).toContain("'Cache-Control', 'no-store'");
  });
  it('es SSR (fuera del contrato) y no emite el evento de conversión', () => {
    expect(pagina).toMatch(/export const prerender = false/);
    expect(pagina.replace(/\/\/.*$/gm, '')).not.toMatch(/saastroTrack|generate_lead/);
  });
  it('BaseLayout: indexable=false pone la meta pero no toca los proveedores', () => {
    expect(base).toMatch(/!noindex && !indexable && <meta name="robots" content="noindex, follow"/);
    // resolveTracking recibe `noindex`, nunca `indexable`
    expect(base).toMatch(/resolveTracking\(settings, \{\s*noindex,/);
    expect(base).not.toMatch(/resolveTracking\([^)]*indexable/);
  });
});

describe('cableado del envío → conversión → gracias', () => {
  const leer = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  it('LandingForm pasa onSuccess a HubForm y llama a onLeadSuccess con thanksHref', () => {
    const f = leer('../components/lp/LandingForm.tsx');
    expect(f).toMatch(/onSuccess=\{handleSuccess\}/);
    expect(f).toMatch(/onLeadSuccess\(values, \{ thanksHref \}/);
  });
  it('las dos plantillas de landing pasan thanksHref al formulario', () => {
    for (const rel of ['../components/lp/LandingHeroForm.astro', '../components/lp/LandingLong.astro']) {
      expect(leer(rel), rel).toMatch(/thanksHref=\{thanksHref\}/);
    }
  });
  it('la ruta de la landing apunta a /lp/gracias con el prefijo de idioma', () => {
    expect(leer('../pages/[...locale]/lp/[slug].astro')).toMatch(/thanksHref=\{lp\('\/lp\/gracias'\)\}/);
  });
});
