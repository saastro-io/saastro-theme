/**
 * build-info.ts — qué commit se construyó. Lo sirve `/health.json` para poder MEDIR
 * qué sha corre en producción (mergeado no es desplegado: LEYES 5).
 *
 * Workers Builds inyecta `WORKERS_CI_COMMIT_SHA` en el build
 * (developers.cloudflare.com/workers/ci-cd/builds/configuration/); `astro.config.mjs` la
 * convierte en constante porque el código prerenderizado no ve `process.env`. Sin ella (dev local,
 * build a mano) NO se inventa un sha: sale `null`, y quien mida sabe que no hay dato.
 */
const SHA = /^[0-9a-f]{40}$/;

export interface BuildInfo {
  /** SHA-1 completo del commit construido, o `null` si el build no lo declaró. */
  sha: string | null;
  /** Rama del evento, o `null`. */
  branch: string | null;
}

/** Lo que `astro.config.mjs` inyectó al construir (vacío en dev y en tests). */
const DEL_BUILD: Record<string, string | undefined> = {
  WORKERS_CI_COMMIT_SHA: import.meta.env.BUILD_SHA,
  WORKERS_CI_BRANCH: import.meta.env.BUILD_BRANCH,
};

export function buildInfo(env: Record<string, string | undefined> = DEL_BUILD): BuildInfo {
  const sha = (env.WORKERS_CI_COMMIT_SHA ?? '').trim().toLowerCase();
  const branch = (env.WORKERS_CI_BRANCH ?? '').trim();
  return { sha: SHA.test(sha) ? sha : null, branch: branch || null };
}
