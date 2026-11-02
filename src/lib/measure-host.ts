/**
 * measure-host — en qué hosts NO se mide (beacon de CF, Gen, render-ratio).
 *
 * Se bloquea localhost, el dev local y todo `*.saastro.io` (la preview de Studio y las
 * apps internas sirven el site bajo un origen de saastro.io), SALVO el host propio del
 * site (el de `SITE_URL`): un site de la suite que sirve en un subdominio de saastro.io
 * es tráfico real y debe medirse. Sin host propio (`''`) todo `*.saastro.io` sigue
 * bloqueado.
 *
 * Esta función la usa el servidor (RenderRatio). Los dos scripts `is:inline` del
 * navegador (BaseLayout y GenTracking) no pueden importarla y replican la MISMA
 * condición; `measure-host.test.ts` comprueba que la copia no se separa.
 */
export function isBlockedMeasureHost(host: string, ownHost = ''): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    (host.endsWith('.saastro.io') && host !== ownHost) ||
    host.endsWith('.saastro.test') ||
    host.endsWith('.local')
  );
}
