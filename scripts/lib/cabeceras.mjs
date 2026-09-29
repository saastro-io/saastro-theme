/**
 * Los dos lectores de las listas de cabeceras de seguridad, compartidos por
 * `cabeceras-check.mjs` (estático, sobre el fuente) y
 * `cabeceras-worker-check.mjs` (sobre las respuestas del Worker construido).
 *
 * Devuelven `Map<nombre en minúsculas, valor>`: los dos checks comparan
 * nombres Y valores, y un único lector por lista evita que cada check lea la
 * suya de forma distinta.
 */

export const RUTA_HEADERS = 'public/_headers'
export const RUTA_TS = 'src/lib/security-headers.ts'

/**
 * `Strict-Transport-Security` se ignora a propósito en las dos: lo manda la
 * configuración de zona con `includeSubDomains` y declararlo aquí lo pisaría
 * a la baja (ver el comentario de cada fichero).
 */
export const IGNORADAS = new Set(['strict-transport-security'])

/**
 * El SUELO: las cinco que la plantilla sirve hoy. Sin él, borrar una cabecera
 * de las DOS listas a la vez dejaría los checks en verde (siguen cuadrando).
 * Quitar una de aquí es una decisión, no una edición: se hace a propósito.
 */
export const CABECERAS_MINIMAS = [
  'content-security-policy',
  'permissions-policy',
  'referrer-policy',
  'x-content-type-options',
  'x-frame-options',
]

/** Las del suelo que no están en la lista. */
export const faltanMinimas = (mapa) => CABECERAS_MINIMAS.filter((n) => !mapa.has(n))

/** Cabeceras del bloque `/*` de `_headers` (el global; los de caché van aparte). */
export function leerHeaders(texto) {
  const cabeceras = new Map()
  let dentro = false
  for (const linea of texto.split('\n')) {
    if (/^\S/.test(linea)) {
      dentro = linea.trim() === '/*'
      continue
    }
    if (!dentro) continue
    const m = linea.match(/^\s+([A-Za-z][A-Za-z0-9-]*):\s*(.*?)\s*$/)
    if (m) cabeceras.set(m[1].toLowerCase(), m[2])
  }
  return cabeceras
}

/** Entradas de `SECURITY_HEADERS` en el módulo del middleware ('…' o "…"). */
export function leerTs(texto) {
  const bloque = texto.match(/SECURITY_HEADERS[^=]*=\s*\{([\s\S]*?)\n\}/)
  const cabeceras = new Map()
  if (!bloque) return cabeceras
  for (const m of bloque[1].matchAll(/^\s*'([^']+)'\s*:\s*(?:'([^']*)'|"([^"]*)")\s*,?\s*$/gm)) {
    cabeceras.set(m[1].toLowerCase(), m[2] ?? m[3])
  }
  return cabeceras
}

/** Las que cuentan para comparar, ordenadas. */
export const comparables = (mapa) => [...mapa.keys()].filter((n) => !IGNORADAS.has(n)).sort()

/**
 * Diferencias entre las dos listas: nombres que solo están en una y nombres
 * con valor distinto. Vacío = cuadran.
 */
export function diferencias(assets, worker) {
  const soloAssets = comparables(assets).filter((n) => !worker.has(n))
  const soloWorker = comparables(worker).filter((n) => !assets.has(n))
  const valorDistinto = comparables(assets)
    .filter((n) => worker.has(n) && worker.get(n) !== assets.get(n))
    .map((n) => ({ nombre: n, assets: assets.get(n), worker: worker.get(n) }))
  return { soloAssets, soloWorker, valorDistinto }
}
