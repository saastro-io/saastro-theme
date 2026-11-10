/**
 * maintenance-gate.ts — la puerta de «página en construcción» ANTES de todo.
 *
 * La llama `src/worker.ts`, el Worker de entrada, para CADA petición, también las
 * de páginas prerenderizadas: con `assets.run_worker_first` el Worker ve primero
 * lo que antes servía Static Assets sin invocarlo. Un middleware de Astro no
 * puede hacer esto (el adaptador sirve el asset prerenderizado antes de montarlo;
 * medido con wrangler dev el 10-nov, ver CLAUDE.md («Página en construcción»)).
 *
 * `null` = pasa (el llamador delega en Astro/assets). Falla abierto.
 */
import { getSettings } from './settings';
import { getLocaleFromUrl } from '../i18n/utils';
import {
  PASE_COOKIE,
  PASE_PARAM,
  decideMaintenance,
  esRutaExenta,
  parseCookie,
  resolveMaintenance,
  respondMaintenance,
} from './maintenance';

export async function gateMaintenance(request: Request): Promise<Response | null> {
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD') return null;
  try {
    const settings = getSettings();
    const cfg = resolveMaintenance(settings);
    if (!cfg) return null;
    const url = new URL(request.url);
    if (esRutaExenta(url.pathname)) return null;
    const decision = await decideMaintenance(cfg, {
      queryPase: url.searchParams.get(PASE_PARAM),
      cookiePase: parseCookie(request.headers.get('cookie'), PASE_COOKIE),
    });
    return respondMaintenance(decision, {
      url,
      method,
      siteName: settings.site?.name ?? '',
      lang: getLocaleFromUrl(url.pathname),
    });
  } catch {
    return null; // cualquier fallo inesperado: el site se sirve
  }
}
