/**
 * reads.ts — registro de LECTURAS de claves i18n durante el build.
 *
 * Por qué existe: el 29-sep el Header pintaba 'Contact' y 'Saastro' por
 * defecto mientras `nav.contact` y `meta.siteName` esperaban en el JSON sin
 * que nadie los leyera. En inglés el default coincidía con el valor y el
 * gate verbatim no veía nada: una clave muerta sólo se distingue de una viva
 * por si alguien la LEE, no por si su texto aparece en el HTML.
 *
 * Cómo: con el build lanzado con `PUBLIC_SAASTRO_I18N_READS=1` (lo pone
 * `pnpm studio:check`, nunca el build de producción), el middleware envuelve
 * `locals.t` en un Proxy que apunta cada ruta leída y, al acabar la página,
 * la emite en un `<script type="application/saastro-i18n-reads">`. El
 * invariante `i18n-consumo` de `scripts/studio-contract-check.mjs` junta las
 * de todas las páginas y falla por cada hoja del JSON que nadie leyó.
 *
 * Rutas normalizadas: `a.b.c`, y los índices de array como `[]`
 * (`nav.menu[].title`): basta con que UN elemento se lea para que la hoja
 * cuente, porque lo que se mide es si algún componente consume la forma.
 *
 * Límite conocido: pasar un objeto entero a una isla (`t={contactT}`) lo
 * serializa, y serializar lee todas sus hojas. Cuenta como consumo aunque la
 * isla ignore alguna. El check caza lo que NINGÚN código lee; no lo que se
 * lee y se tira.
 */

export const I18N_READS_ENABLED = import.meta.env.PUBLIC_SAASTRO_I18N_READS === '1';

export const I18N_READS_SCRIPT_TYPE = 'application/saastro-i18n-reads';

const hasOwn = Object.prototype.hasOwnProperty;

/** Envuelve `root` para que cada lectura de una propiedad propia se apunte en `reads`. */
export function trackReads<T>(root: T, reads: Set<string>): T {
  const cache = new WeakMap<object, Map<string, unknown>>();

  const wrap = (value: unknown, path: string): unknown => {
    if (value === null || typeof value !== 'object') return value;
    let byPath = cache.get(value);
    const hit = byPath?.get(path);
    if (hit) return hit;
    const isArray = Array.isArray(value);
    const proxy = new Proxy(value, {
      get(target, key, receiver) {
        const out = Reflect.get(target, key, receiver);
        if (typeof key !== 'string' || !hasOwn.call(target, key)) return out;
        if (isArray && key === 'length') return out;
        const childPath = isArray ? `${path}[]` : path ? `${path}.${key}` : key;
        reads.add(childPath);
        // Invariante del Proxy: una propiedad no configurable y no escribible
        // debe devolver SU valor, no un envoltorio.
        const desc = Object.getOwnPropertyDescriptor(target, key);
        if (desc && !desc.configurable && !desc.writable) return out;
        return wrap(out, childPath);
      },
    });
    if (!byPath) cache.set(value, (byPath = new Map()));
    byPath.set(path, proxy);
    return proxy;
  };

  return wrap(root, '') as T;
}

/** Inserta el registro antes del último `</body>` (o al final si no hay). */
export function injectReads(html: string, reads: Set<string>): string {
  const json = JSON.stringify([...reads].sort()).replace(/</g, '\\u003c');
  const tag = `<script type="${I18N_READS_SCRIPT_TYPE}">${json}</script>`;
  const at = html.lastIndexOf('</body>');
  return at === -1 ? html + tag : html.slice(0, at) + tag + html.slice(at);
}
