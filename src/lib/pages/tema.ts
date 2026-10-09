import { TEMAS, type Tema } from '../../blocks/registry';

/**
 * Tema por host: `TEMA_BY_HOST` es un JSON `{"prototipo-b.enlolab.com":"b"}`.
 * Cualquier otra cosa (sin variable, JSON roto, host desconocido, tema que no
 * existe) → `a`. Nunca lanza: un error de configuración no tumba la página.
 */
export function temaForHost(host: string, temaByHost: string | undefined | null): Tema {
  if (!temaByHost) return 'a';
  try {
    const map = JSON.parse(temaByHost) as unknown;
    if (!map || typeof map !== 'object') return 'a';
    const v = (map as Record<string, unknown>)[host.toLowerCase()];
    return typeof v === 'string' && (TEMAS as readonly string[]).includes(v) ? (v as Tema) : 'a';
  } catch {
    return 'a';
  }
}

export function isTema(v: unknown): v is Tema {
  return typeof v === 'string' && (TEMAS as readonly string[]).includes(v);
}
