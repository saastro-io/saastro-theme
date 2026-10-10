// @vitest-environment node
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { previewBridgeScript } from '../src/components/pages/preview-bridge';

// El puente de la vista previa (`/p/<slug>?__pv=…`) en un Chrome de verdad:
// jsdom no ejecuta los <script> de `createContextualFragment`, que es justo lo
// que hidrata las islas cuando el Hub manda el HTML de `/__render`. Chrome,
// como en override-oscuro.test.tsx (CI lo instala en su propio paso).

const HUB = 'https://hub.example.test';
let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await puppeteer.launch({
    headless: 'shell',
    args: process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

const sec = (id: string) => `<section data-saastro="sec:${id}">${id}</section>`;

async function fresh() {
  page = await browser.newPage();
  await page.setContent(
    `<main><div data-saastro-blocks>${sec('a')}${sec('b')}${sec('c')}</div></main>` +
      `<script>window.__replies = []; window.postMessage = (m, o) => window.__replies.push([m, o]);</script>` +
      `<script>${previewBridgeScript(HUB)}</script>`,
  );
}

const send = (data: unknown, origin = HUB) =>
  page.evaluate(
    (d, o) => window.dispatchEvent(new MessageEvent('message', { data: d, origin: o, source: window })),
    data as never,
    origin,
  );
const order = () =>
  page.$$eval('[data-saastro-blocks] > *', (els) => els.map((e) => e.getAttribute('data-saastro')?.slice(4)));
const replies = async () => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.evaluate(() => (window as unknown as { __replies: unknown[] }).__replies);
};

describe('puente postMessage de la vista previa', () => {
  it('insert en un índice, ejecutando los scripts del fragmento, y contesta swapped', async () => {
    await fresh();
    await send({ type: 'insert', id: 'n', index: 1, html: `<section data-saastro="sec:n"><script>window.__ran = 1</script>n</section>` });
    expect(await order()).toEqual(['a', 'n', 'b', 'c']);
    expect(await page.evaluate(() => (window as unknown as { __ran?: number }).__ran)).toBe(1);
    expect(await replies()).toEqual([[{ type: 'swapped', id: 'n' }, HUB]]);
  });

  it('swap reemplaza en su sitio; move reordena; remove quita', async () => {
    await fresh();
    await send({ type: 'swap', id: 'b', html: `<section data-saastro="sec:b">B2</section>` });
    expect(await order()).toEqual(['a', 'b', 'c']);
    expect(await page.$eval('[data-saastro="sec:b"]', (e) => e.textContent)).toBe('B2');
    await send({ type: 'move', id: 'c', index: 0 });
    expect(await order()).toEqual(['c', 'a', 'b']);
    await send({ type: 'remove', id: 'a' });
    expect(await order()).toEqual(['c', 'b']);
    expect((await replies()).map((r) => (r as [{ id: string }])[0].id)).toEqual(['b', 'c', 'a']);
  });

  it('ignora mensajes de otro origen o sin forma', async () => {
    await fresh();
    await send({ type: 'remove', id: 'a' }, 'https://evil.test');
    await send({ type: 'remove' });
    await send('remove a');
    expect(await order()).toEqual(['a', 'b', 'c']);
    expect(await replies()).toEqual([]);
  });
});
