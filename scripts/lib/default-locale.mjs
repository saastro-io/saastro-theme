/**
 * default-locale.mjs — resuelve el DEFAULT LOCALE del repo desde su fuente de
 * verdad, para que los scripts de check (.mjs — no pueden importar TS) no lo
 * hardcodeen. En un descendiente cuyo default no sea 'en', un hardcode haría
 * que la paridad i18n y la clasificación de rutas usaran la base EQUIVOCADA.
 *
 * Orden de resolución:
 *   1. env STUDIO_DEFAULT_LOCALE — override explícito (CI puntual, debug).
 *   2. src/i18n/config.ts        — `defaultLocale: '<locale>'` de i18nConfig
 *                                  (el anchor canónico del linaje del theme).
 *   3. astro.config.(mjs|js|ts|mts) — `defaultLocale: '<locale>'` del bloque
 *                                  i18n declarativo (fallback si un
 *                                  descendiente retiró src/i18n/config.ts).
 *
 * Si ningún anchor casa, FALLA RUIDOSO (throw): jamás un default silencioso.
 * Si un fichero contiene varios `defaultLocale:` con valores DISTINTOS,
 * también falla (ambigüedad — que lo resuelva un humano).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DEFAULT_LOCALE_RE = /\bdefaultLocale\s*:\s*['"]([A-Za-z0-9_-]+)['"]/g

const I18N_CONFIG = 'src/i18n/config.ts'
const ASTRO_CONFIGS = ['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.mts']

/** Todos los valores de `defaultLocale: '…'` del fichero, deduplicados. */
function matchesIn(absPath) {
  const values = new Set()
  for (const m of readFileSync(absPath, 'utf8').matchAll(DEFAULT_LOCALE_RE)) {
    values.add(m[1])
  }
  return [...values]
}

/**
 * @param {string} root  raíz del repo (normalmente process.cwd())
 * @returns {{ locale: string, source: string }}
 * @throws {Error} si no hay anchor que case o el que casa es ambiguo
 */
export function resolveDefaultLocale(root) {
  const fromEnv = process.env.STUDIO_DEFAULT_LOCALE
  if (fromEnv) return { locale: fromEnv, source: 'env STUDIO_DEFAULT_LOCALE' }

  const candidates = [I18N_CONFIG, ...ASTRO_CONFIGS]
  for (const rel of candidates) {
    const abs = join(root, rel)
    if (!existsSync(abs)) continue
    const values = matchesIn(abs)
    if (values.length === 0) continue
    if (values.length > 1) {
      throw new Error(
        `default locale AMBIGUO en ${rel}: defaultLocale aparece con valores distintos (${values.join(', ')}).\n` +
          `  Unifícalos, o fuerza uno con STUDIO_DEFAULT_LOCALE=<locale>.`,
      )
    }
    return { locale: values[0], source: rel }
  }

  throw new Error(
    `no se pudo resolver el default locale del repo: ningún anchor \`defaultLocale: '<locale>'\` ` +
      `en ${I18N_CONFIG} ni en astro.config.*.\n` +
      `  Declara i18nConfig.defaultLocale en ${I18N_CONFIG} (fuente de verdad), ` +
      `o fuerza uno con STUDIO_DEFAULT_LOCALE=<locale>.`,
  )
}
