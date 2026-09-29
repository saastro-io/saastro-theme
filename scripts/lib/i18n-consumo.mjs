/**
 * i18n-consumo — ¿qué hojas del JSON de traducciones no LEE nadie?
 *
 * La pieza pura del invariante `i18n-consumo` de studio-contract-check.mjs.
 * Las lecturas las apunta en build `src/i18n/reads.ts` (con
 * PUBLIC_SAASTRO_I18N_READS=1) y las emite cada página; aquí sólo se compara.
 *
 * Misma normalización que reads.ts: `a.b.c`, índices de array como `[]`.
 * Un array de rich spans (`[{ text, marks? }]`) es UNA hoja: `getTranslations`
 * lo aplana a string y el código lo lee como tal.
 */

// Misma definición que isRichSpanArray de studio-contract-check.mjs.
function isRichSpanArray(v) {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every(
      (s) =>
        s != null &&
        typeof s === 'object' &&
        !Array.isArray(s) &&
        typeof s.text === 'string' &&
        Object.keys(s).every((k) => k === 'text' || k === 'marks'),
    )
  )
}

/** Rutas normalizadas de todas las hojas de `obj`. */
export function hojasI18n(obj, path = '', out = new Set()) {
  if (obj === null || typeof obj !== 'object' || isRichSpanArray(obj)) {
    if (path) out.add(path)
    return out
  }
  if (Array.isArray(obj)) {
    for (const item of obj) hojasI18n(item, `${path}[]`, out)
    return out
  }
  // Un array u objeto VACÍO no tiene hojas: no hay nada que leer (su `.length`
  // no se apunta), y exigirlo sería un falso rojo en cada lista sin elementos.
  for (const k of Object.keys(obj)) hojasI18n(obj[k], path ? `${path}.${k}` : k, out)
  return out
}

/** ¿`hoja` cae dentro de alguno de los prefijos exentos? */
function exenta(hoja, exentas) {
  return exentas.some((p) => hoja === p || hoja.startsWith(`${p}.`) || hoja.startsWith(`${p}[]`))
}

/**
 * Hojas que ninguna página leyó.
 * @param {Set<string>} hojas   — de hojasI18n(json)
 * @param {Set<string>} leidas  — unión de los registros de todas las páginas
 * @param {string[]} exentas    — prefijos que el fetcher no puede ver (rutas SSR en modo dist)
 * @returns {{ huerfanas: string[], noVerificadas: string[] }}
 */
export function huerfanas(hojas, leidas, exentas = []) {
  const out = { huerfanas: [], noVerificadas: [] }
  for (const h of [...hojas].sort()) {
    if (leidas.has(h)) continue
    if (exenta(h, exentas)) out.noVerificadas.push(h)
    else out.huerfanas.push(h)
  }
  return out
}
