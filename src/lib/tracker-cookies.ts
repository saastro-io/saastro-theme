/**
 * Borrar las cookies de los proveedores al RETIRAR el consentimiento.
 *
 * Medido en Chrome (2-nov-2026): tras apagar «Analytics» el banner recargaba la
 * página y los scripts dejaban de cargar, pero `_ga`, `_ga_<id>`, `_clck` y
 * `_clsk` seguían en el navegador. No se enviaban a nadie, pero retirar un
 * consentimiento tiene que dejar de usar —y quitar— lo que se guardó con él.
 *
 * Solo cookies PROPIAS del site (las que el script del proveedor escribe en el
 * dominio de la página). Las de dominios del proveedor (clarity.ms, linkedin.com…)
 * no se pueden borrar desde aquí. Los nombres salen del catálogo único
 * (tracking-providers.json, campo `cookies`).
 *
 * Solo se llama ante una acción explícita del visitante (revocar), nunca como
 * barrido al cargar: una `_ga` en el dominio raíz puede ser de otro site de la
 * misma familia, y borrarla sin que el visitante haya decidido nada aquí sería
 * pisar su consentimiento allí.
 */
import catalogo from './tracking-providers.json';

export type TrackerCategory = 'analytics' | 'marketing';

interface CookieRule {
  exact: string[];
  prefix: string[];
}

const REGLAS: ReadonlyArray<{ category: string; cookies: CookieRule }> = (
  catalogo.providers as Array<{ category: string; cookies?: CookieRule }>
).map((p) => ({ category: p.category, cookies: p.cookies ?? { exact: [], prefix: [] } }));

/** Reglas de las categorías pedidas (GTM, categoría `any`, no deja cookies propias). */
export function rulesFor(categories: readonly TrackerCategory[]): CookieRule {
  const exact = new Set<string>();
  const prefix = new Set<string>();
  for (const r of REGLAS) {
    if (!categories.includes(r.category as TrackerCategory)) continue;
    r.cookies.exact.forEach((n) => exact.add(n));
    r.cookies.prefix.forEach((n) => prefix.add(n));
  }
  return { exact: [...exact], prefix: [...prefix] };
}

export function matchesRule(name: string, rule: CookieRule): boolean {
  return rule.exact.includes(name) || rule.prefix.some((p) => name.startsWith(p));
}

/**
 * Dominios con los que probar el borrado además del host: `theme.saastro.io` →
 * `theme.saastro.io` y `saastro.io` (GA escribe en el dominio registrable, no en el
 * host). Nunca el TLD suelto. `localhost` y las IP no llevan atributo `domain`.
 */
export function domainCandidates(hostname: string): string[] {
  if (!hostname || hostname.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return [];
  const partes = hostname.split('.');
  if (partes.length < 2) return [];
  const out: string[] = [];
  for (let i = 0; i <= partes.length - 2; i++) out.push(partes.slice(i).join('.'));
  return out;
}

export interface CookieEnv {
  document: { cookie: string };
  location: { hostname: string };
}

const CADUCADA = 'Thu, 01 Jan 1970 00:00:00 GMT';

/** Borra las cookies de las categorías dadas. Devuelve los nombres que intentó borrar. */
export function clearTrackerCookies(
  categories: readonly TrackerCategory[],
  env: CookieEnv = { document, location },
): string[] {
  const regla = rulesFor(categories);
  const nombres = env.document.cookie
    .split(';')
    .map((c) => c.split('=')[0].trim())
    .filter((n) => n !== '' && matchesRule(n, regla));
  const dominios = domainCandidates(env.location.hostname);
  for (const nombre of new Set(nombres)) {
    env.document.cookie = `${nombre}=; expires=${CADUCADA}; path=/`;
    for (const d of dominios) {
      env.document.cookie = `${nombre}=; expires=${CADUCADA}; path=/; domain=${d}`;
    }
  }
  return [...new Set(nombres)];
}

/**
 * Con un tracker VIVO no basta con borrar y recargar: medido en Chrome, el script
 * de GA reescribió `_ga_<id>` entre el borrado y la recarga. Por eso, si hay que
 * recargar, se deja una marca (sessionStorage) y la limpieza se REPITE al cargar la
 * página nueva, cuando ya no hay ningún script del proveedor que las escriba.
 */
export const CLAVE_LIMPIEZA = 'saastro:limpiar-cookies';

interface Almacen {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export function marcarLimpiezaPendiente(
  categories: readonly TrackerCategory[],
  storage: Almacen | undefined = typeof sessionStorage === 'undefined' ? undefined : sessionStorage,
): void {
  try {
    storage?.setItem(CLAVE_LIMPIEZA, JSON.stringify(categories));
  } catch {
    /* almacenamiento bloqueado: queda el borrado inmediato */
  }
}

/** Aplica y consume la marca. Devuelve los nombres borrados ([] si no había marca). */
export function aplicarLimpiezaPendiente(
  env: CookieEnv = { document, location },
  storage: Almacen | undefined = typeof sessionStorage === 'undefined' ? undefined : sessionStorage,
): string[] {
  try {
    const crudo = storage?.getItem(CLAVE_LIMPIEZA);
    if (!crudo) return [];
    storage?.removeItem(CLAVE_LIMPIEZA);
    const lista = JSON.parse(crudo);
    if (!Array.isArray(lista)) return [];
    const validas = lista.filter((c): c is TrackerCategory => c === 'analytics' || c === 'marketing');
    return validas.length ? clearTrackerCookies(validas, env) : [];
  } catch {
    return [];
  }
}
