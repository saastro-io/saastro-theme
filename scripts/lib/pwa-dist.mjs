/**
 * El web manifest es OPT-IN (src/lib/pwa.ts). Esta es la regla, sobre el HTML CONSTRUIDO:
 *
 *   - `pwa.enabled` apagado  => NINGÚN html lleva `rel="manifest"` y no existe ni
 *     `manifest.webmanifest` ni el viejo `manifest.json` en dist/client.
 *   - `pwa.enabled` encendido => TODO html que lleve `rel="manifest"` apunta a
 *     /manifest.webmanifest, existe ese fichero y es un JSON con name/short_name/icons;
 *     y la home lo enlaza.
 *
 * Función pura (la ejecuta scripts/pwa-check.mjs y la prueba scripts/lib/pwa-dist.test.ts).
 */
const LINK = /<link\b[^>]*\brel=["']?manifest["']?[^>]*>/gi;

export function enabledDeSettings(pwa) {
  return !!pwa && typeof pwa === 'object' && (pwa.enabled === true || pwa.enabled === 'true');
}

/**
 * @param {{enabled:boolean, htmls:Record<string,string>, files:Record<string,string>}} a
 *   htmls: ruta -> contenido; files: ruta relativa a dist/client -> contenido de los ficheros de manifest que existan.
 * @returns {string[]} problemas (vacío = verde)
 */
export function comprobar({ enabled, htmls, files }) {
  const problemas = [];
  const rutas = Object.keys(htmls);
  if (rutas.length === 0) return ['no hay HTML en dist/client: ¿se construyó?'];
  const conLink = rutas.filter((r) => (htmls[r].match(LINK) ?? []).length > 0);

  if (!enabled) {
    for (const r of conLink) problemas.push(`${r}: lleva <link rel="manifest"> con pwa.enabled apagado`);
    for (const f of Object.keys(files)) problemas.push(`${f}: existe con pwa.enabled apagado`);
    return problemas;
  }

  for (const r of conLink) {
    for (const l of htmls[r].match(LINK) ?? []) {
      if (!/href=["']?\/manifest\.webmanifest["'\s>]/.test(l)) problemas.push(`${r}: el link no apunta a /manifest.webmanifest (${l})`);
    }
  }
  if (!conLink.some((r) => r === 'index.html')) problemas.push('index.html no enlaza el manifest con pwa.enabled encendido');
  const m = files['manifest.webmanifest'];
  if (m === undefined) problemas.push('falta manifest.webmanifest con pwa.enabled encendido');
  else {
    try {
      const j = JSON.parse(m);
      for (const k of ['name', 'short_name', 'start_url', 'icons']) if (!j[k] || (Array.isArray(j[k]) && !j[k].length)) problemas.push(`manifest.webmanifest: falta ${k}`);
    } catch {
      problemas.push('manifest.webmanifest no es JSON válido');
    }
  }
  if ('manifest.json' in files) problemas.push('queda el viejo manifest.json estático');
  return problemas;
}
