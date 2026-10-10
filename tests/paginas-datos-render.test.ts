// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// «La fixture pinta `demo`», con el HTML de verdad. El compilador de Astro con
// el adaptador de Cloudflare no arranca dentro de vitest (Container API +
// getViteConfig: «module is not defined» en el runner de workerd), así que se
// construye el Worker y se le pregunta, como `cabeceras-worker-check`.
// Cuesta un `astro build` (~20 s).

type Worker = { fetch: (url: string, init?: RequestInit) => Promise<Response>; dispose: () => Promise<void> };
let worker: Worker;

beforeAll(async () => {
  execFileSync('pnpm', ['exec', 'astro', 'build'], { stdio: 'pipe', env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' } });
  process.env.WRANGLER_SEND_METRICS ??= 'false';
  const { unstable_startWorker } = await import('wrangler');
  worker = (await unstable_startWorker({
    config: 'dist/server/wrangler.json',
    dev: { server: { port: 0 }, inspector: false, logLevel: 'error' },
  })) as unknown as Worker;
}, 240_000);

afterAll(async () => {
  await worker?.dispose();
});

describe('/p/demo con la fixture (sin Hub, sin secreto)', () => {
  for (const [path, title] of [
    ['/p/demo', 'Pages as data · demo'],
    ['/es/p/demo', 'Páginas como datos · demo'],
  ]) {
    it(`${path} pinta los cinco bloques con sus marcadores`, async () => {
      const r = await worker.fetch(`http://localhost${path}`);
      const html = await r.text();
      expect(r.status).toBe(200);
      expect(html).toContain(`<title>${title}</title>`);
      for (const id of ['intro', 'ventajas', 'dudas', 'cierre', 'form']) {
        expect(html).toContain(`data-saastro="sec:${id}"`);
      }
      expect(html).toContain('data-saastro-field="items.0.q"');
      expect(html).toContain('data-tema="a"');
      expect(r.headers.get('x-saastro-page-rev')).toBe('1');
    });
  }

  it('sin secreto, /__render, /__purge y ?__pv son 404 (también sin content-type)', async () => {
    for (const path of ['/__render', '/__purge']) {
      const r = await worker.fetch(`http://localhost${path}`, { method: 'POST', body: '{}' });
      await r.arrayBuffer();
      expect(r.status, path).toBe(404);
    }
    const pv = await worker.fetch('http://localhost/p/demo?__pv=1.ab');
    await pv.arrayBuffer();
    expect(pv.status).toBe(404);
  });
});
