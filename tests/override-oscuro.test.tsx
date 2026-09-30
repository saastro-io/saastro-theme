// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile } from '@tailwindcss/node';
import puppeteer, { type Browser } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Checkbox } from '../src/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '../src/components/ui/radio-group';
import { Switch } from '../src/components/ui/switch';

// Un consumidor que pinta el marcado de otro color pasa `data-checked:bg-*`.
// En claro ganaba; en oscuro lo pisaba `dark:data-checked:bg-primary` del
// primitivo: twMerge tira el `data-checked:bg-primary` base (mismo stack de
// variantes) pero no el `dark:` (stack distinto), y con
// `@custom-variant dark (&:is(.dark *))` éste tiene más especificidad.
// Arreglado en el registry por saastro-ui#45 (d41e282); este es su test,
// portado al theme y medido con el CSS REAL del theme (src/styles/global.css,
// sus tokens oklch y su variante `dark`), en Chrome: jsdom no procesa
// @layer, color-mix ni oklch.
//
// Vive en tests/ y NO junto a los primitivos a propósito: LandingForm y
// ContactSheet hacen `import.meta.glob('../ui/*.tsx', { eager: true })`, y un
// .test.tsx en src/components/ui entra en el bundle del Worker con puppeteer
// y lightningcss (la landing SSR da 500).
//
// Chrome: `allowBuilds` apaga el postinstall de puppeteer, así que en local
// hace falta una vez `pnpm exec puppeteer browsers install chrome-headless-shell`
// (CI lo hace en su propio paso). Sin él, este fichero sale rojo al lanzar.

const GLOBAL_CSS = resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles/global.css');

const OVERRIDE = 'data-checked:bg-red-500';
// Referencias en la misma página: se compara color computado con color
// computado, no con una cadena oklch que Chrome puede serializar distinto.
const REFS = `<div id="ref-red" class="bg-red-500"></div><div id="ref-primary" class="bg-primary"></div><div id="ref-input30" class="bg-input/30"></div>`;

let browser: Browser;
let compilado: Awaited<ReturnType<typeof compile>>;

beforeAll(async () => {
  compilado = await compile(readFileSync(GLOBAL_CSS, 'utf8'), {
    base: dirname(GLOBAL_CSS),
    onDependency: () => {},
  });
  // headless 'shell': el headless por defecto cuelga fuera de una terminal.
  // En el runner de Actions (Ubuntu 23.10+) AppArmor niega los user
  // namespaces y Chrome muere con «No usable sandbox»: sólo ahí se quita; la
  // página sólo carga un setContent local.
  browser = await puppeteer.launch({
    headless: 'shell',
    args: process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

async function medir(markup: string, tema: 'light' | 'dark') {
  const clases = [...(markup + REFS).matchAll(/class="([^"]*)"/g)].flatMap((m) =>
    m[1].split(/\s+/).filter(Boolean),
  );
  const css = compilado.build(clases);
  const page = await browser.newPage();
  try {
    await page.setContent(
      `<!doctype html><html class="${tema === 'dark' ? 'dark' : ''}"><head><style>${css}</style></head><body>${markup}${REFS}</body></html>`,
    );
    return await page.evaluate(() => {
      const bg = (el: Element | null) => (el ? getComputedStyle(el).backgroundColor : null);
      return {
        control: bg(document.querySelector('[data-prueba]')),
        red: bg(document.getElementById('ref-red')),
        primary: bg(document.getElementById('ref-primary')),
        input30: bg(document.getElementById('ref-input30')),
      };
    });
  } finally {
    await page.close();
  }
}

type Control = (props: { className?: string; checked: boolean }) => React.ReactElement;

const casos: Array<[string, Control]> = [
  [
    'checkbox',
    ({ className, checked }) => (
      <Checkbox data-prueba="" defaultChecked={checked} className={className} />
    ),
  ],
  [
    'radio-group',
    ({ className, checked }) => (
      <RadioGroup defaultValue={checked ? 'a' : undefined}>
        <RadioGroupItem data-prueba="" value="a" className={className} />
      </RadioGroup>
    ),
  ],
  // Control: el switch del theme no lleva el patrón (su `dark:` es de
  // `data-unchecked`). Si un sync lo trae, esto lo caza.
  [
    'switch',
    ({ className, checked }) => (
      <Switch data-prueba="" defaultChecked={checked} className={className} />
    ),
  ],
];

describe.each(casos)('%s', (nombre, Control) => {
  it('marcado: el markup lleva data-checked (si no, lo de abajo no mide nada)', () => {
    const markup = renderToStaticMarkup(<Control checked className={OVERRIDE} />);
    expect(markup).toMatch(/data-prueba=""[^>]*data-checked|data-checked[^>]*data-prueba=""/);
  });

  for (const tema of ['light', 'dark'] as const) {
    it(`override ${OVERRIDE} marcado en ${tema}: gana el del consumidor, no primary`, async () => {
      const m = await medir(renderToStaticMarkup(<Control checked className={OVERRIDE} />), tema);
      expect(m.red).not.toBe(m.primary);
      expect(m.control).toBe(m.red);
    }, 30_000);

    it(`sin override marcado en ${tema}: sigue en primary`, async () => {
      const m = await medir(renderToStaticMarkup(<Control checked />), tema);
      expect(m.control).toBe(m.primary);
    }, 30_000);
  }

  if (nombre !== 'switch') {
    it('sin override desmarcado en dark: sigue en input/30', async () => {
      const m = await medir(renderToStaticMarkup(<Control checked={false} />), 'dark');
      expect(m.input30).not.toBe(m.primary);
      // Dos transparentes serían iguales sin medir nada.
      expect(m.input30).not.toBe('rgba(0, 0, 0, 0)');
      expect(m.control).toBe(m.input30);
    }, 30_000);
  }
});
