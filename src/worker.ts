/**
 * worker.ts — Worker de entrada (`main` en wrangler.jsonc).
 *
 * Hace una sola cosa antes de delegar en el adaptador de Astro: la puerta de
 * «página en construcción» (`src/lib/maintenance-gate.ts`). Con
 * `assets.run_worker_first` (wrangler.jsonc) el Worker recibe también las
 * páginas prerenderizadas; `handle()` las sirve luego desde ASSETS como siempre.
 * Apagado (`maintenance.enabled: false`) la puerta devuelve `null` sin red.
 */
import { handle } from '@astrojs/cloudflare/handler';
import { gateMaintenance } from './lib/maintenance-gate';
import { applySecurityHeaders } from './lib/security-headers';

export default {
  async fetch(request: Request, env: unknown, context: Parameters<typeof handle>[2]): Promise<Response> {
    const blocked = await gateMaintenance(request);
    if (blocked) {
      // Respuesta generada aquí: no pasa por el middleware, se viste a mano.
      applySecurityHeaders(blocked.headers);
      return blocked;
    }
    return handle(request, env as never, context);
  },
};
