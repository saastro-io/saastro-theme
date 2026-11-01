/**
 * Landing de captación (`chrome: minimo`): cabecera solo-logo + CTA fijo en móvil.
 * Opt-in: por defecto NADA cambia (`completo`). Se prueba lo que puede romperse en
 * silencio: que lo mínimo no arrastre enlaces de salida, que el CTA tenga a dónde
 * llevar y que su script haga lo que dice.
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const leer = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('esquema y ruta', () => {
  it('chrome es opt-in: el valor por defecto es `completo`', () => {
    expect(leer('../content.config.ts')).toMatch(/chrome: z\.enum\(\['completo', 'minimo'\]\)\.default\('completo'\)/);
  });
  it('el CTA se monta SOLO con chrome minimo y la cabecera la decide SiteLayout', () => {
    const r = leer('../pages/[...locale]/lp/[slug].astro');
    expect(r).toMatch(/const minimo = landing\.chrome === 'minimo'/);
    expect(r).toMatch(/\{minimo && <StickyCta label=\{ctaLabel\} \/>\}/);
    expect(r).toMatch(/chrome=\{landing\.chrome\}/);
  });
  it('REGRESIÓN: la ruta no pasa un slot="header" condicional (dejaba las landings `completo` SIN cabecera)', () => {
    // Astro cuenta `{cond && <X slot="header" />}` como contenido de la ranura aunque sea false.
    expect(leer('../pages/[...locale]/lp/[slug].astro')).not.toMatch(/slot="header"/);
  });
  it('SiteLayout: `completo` conserva el Header de siempre; solo `minimo` usa LandingHeader', () => {
    const l = leer('../layouts/SiteLayout.astro');
    expect(l).toMatch(/chrome = 'completo'/);
    expect(l).toMatch(/chrome === 'minimo' \? \(\s*<LandingHeader[\s\S]*?\) : \(\s*<Header menu=\{navMenu\}/);
  });
});

describe('LandingHeader (sin enlaces de salida)', () => {
  const h = leer('../components/lp/LandingHeader.astro');
  it('no importa menú, selector de idioma, cambio de tema ni botón de contacto', () => {
    for (const prohibido of ['DesktopMenu', 'MobileMenu', 'LocaleSelector', 'ToggleTheme', 'ContactSheet']) {
      expect(h, prohibido).not.toContain(prohibido);
    }
  });
  it('lleva el logo', () => {
    expect(h).toContain('<Logo');
  });
});

describe('ancla del formulario', () => {
  it('las dos plantillas de landing tienen id="lead-form" (a donde apunta el CTA)', () => {
    for (const f of ['LandingHeroForm', 'LandingLong']) {
      expect(leer(`../components/lp/${f}.astro`), f).toMatch(/<div id="lead-form" class=/);
    }
  });
  it('el CTA apunta a esa ancla por defecto', () => {
    expect(leer('../components/lp/StickyCta.astro')).toMatch(/href = '#lead-form'/);
  });
});

describe('script del CTA fijo', () => {
  const codigo = leer('../components/lp/StickyCta.astro').match(/<script is:inline>([\s\S]*?)<\/script>/)![1];

  function ejecutar(conIO: boolean, hayForm = true) {
    const bar = { style: { transform: '' }, inert: false };
    let cb: (e: Array<{ isIntersecting: boolean }>) => void = () => {};
    const win: Record<string, unknown> = {};
    if (conIO) {
      win.IntersectionObserver = function (f: typeof cb) { cb = f; return { observe: () => {} }; };
    }
    const document = { getElementById: (id: string) => (id === 'lp-sticky-cta' ? bar : hayForm ? {} : null) };
    runInNewContext(codigo, { window: win, document, ...(conIO ? { IntersectionObserver: win.IntersectionObserver } : {}) });
    return { bar, ver: (isIntersecting: boolean) => cb([{ isIntersecting }]), lote: (e: Array<{ isIntersecting: boolean }>) => cb(e) };
  }

  it('esconde la barra mientras el formulario está en pantalla y la devuelve al salir', () => {
    const { bar, ver } = ejecutar(true);
    ver(true);
    expect(bar.style.transform).toBe('translateY(100%)');
    expect(bar.inert).toBe(true); // fuera de pantalla: ni Tab ni lector de pantalla
    ver(false);
    expect(bar.style.transform).toBe('');
    expect(bar.inert).toBe(false);
  });
  it('si el navegador entrega varias entradas juntas, manda la última', () => {
    const { bar, lote } = ejecutar(true);
    lote([{ isIntersecting: true }, { isIntersecting: false }]); // antigua «a la vista», actual «fuera»
    expect(bar.style.transform).toBe('');
    lote([{ isIntersecting: false }, { isIntersecting: true }]);
    expect(bar.style.transform).toBe('translateY(100%)');
  });
  it('el relleno inferior móvil existe y SOLO aplica si la barra está en la página (:has)', () => {
    const c = leer('../components/lp/StickyCta.astro');
    expect(c).toMatch(/@media \(max-width: 767px\)[\s\S]*body:has\(#lp-sticky-cta\)[\s\S]*padding-bottom: 5rem/);
    // REGRESIÓN: `body { padding-bottom }` a secas se pegaba a todas las landings de la ruta
    expect(c).not.toMatch(/\n\s*body \{\s*padding-bottom/);
  });
  it('sin IntersectionObserver o sin formulario no lanza y deja la barra visible', () => {
    expect(() => ejecutar(false)).not.toThrow();
    expect(() => ejecutar(true, false)).not.toThrow();
    expect(ejecutar(false).bar.style.transform).toBe('');
  });
});
