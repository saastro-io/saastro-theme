import { TEMAS, type Tema } from '../../blocks/registry';

/** De dónde salió el tema: va a `x-saastro-tema` para poder verlo en producción. */
export type FuenteTema = 'mapa' | 'host-fuera-del-mapa' | 'sin-mapa' | 'mapa-invalido';

/**
 * Tema por host: `TEMA_BY_HOST` es `{"prototipo-b.enlolab.com":"b"}`, como
 * STRING JSON (var de texto de wrangler) o como OBJETO (var JSON de wrangler o
 * del panel de Cloudflare: `"TEMA_BY_HOST": {"…":"b"}` sin comillas). Las dos
 * formas valen; la segunda es la que `astro:env` tira sin avisar (solo pasa
 * strings), y por eso el host b salía con el tema a.
 *
 * Cualquier otra cosa (sin variable, JSON roto, host desconocido, tema que no
 * existe) → `a`. Nunca lanza: un error de configuración no tumba la página.
 */
export function resolverTema(host: string, temaByHost: unknown): { tema: Tema; fuente: FuenteTema } {
  if (temaByHost === undefined || temaByHost === null || temaByHost === '') return { tema: 'a', fuente: 'sin-mapa' };
  let map: unknown = temaByHost;
  if (typeof temaByHost === 'string') {
    try {
      map = JSON.parse(temaByHost);
    } catch {
      return { tema: 'a', fuente: 'mapa-invalido' };
    }
  }
  if (!map || typeof map !== 'object' || Array.isArray(map)) return { tema: 'a', fuente: 'mapa-invalido' };
  const v = (map as Record<string, unknown>)[host.toLowerCase()];
  if (v === undefined) return { tema: 'a', fuente: 'host-fuera-del-mapa' };
  return isTema(v) ? { tema: v, fuente: 'mapa' } : { tema: 'a', fuente: 'mapa-invalido' };
}

export function temaForHost(host: string, temaByHost: unknown): Tema {
  return resolverTema(host, temaByHost).tema;
}

export function isTema(v: unknown): v is Tema {
  return typeof v === 'string' && (TEMAS as readonly string[]).includes(v);
}
