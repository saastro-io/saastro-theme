/**
 * Los secretos del Worker `saastro-theme`. Hoy el Worker no tiene NINGUNO, y
 * eso es el estado correcto: aquí solo queda declarado el token de despliegue,
 * que vive en 1Password y en los secrets de GitHub pero NO en el Worker.
 *
 * ESTA LISTA ES EL CONTRATO. `sync-secrets` no descubre nada: sube exactamente
 * lo que aquí se declara, leyéndolo de `op://Saastro/saastro-theme-prod/<CAMPO>`.
 * Si un secreto no está aquí, no se sube; si está aquí y no está en 1Password,
 * `--check` lo dice. Los dos lados se cruzan contra `wrangler secret list`, que
 * es lo que de verdad tiene el Worker.
 *
 * Molde: `saastro-hub/apps/hub-react/scripts/secretos.ts` (#489, #492).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * QUÉ PASÓ CON LOS CINCO QUE HABÍA, porque un fichero que se queda vacío sin
 * explicación se borra al mes siguiente.
 *
 * El Worker llevaba `ENCRYPTION_KEY`, `GITHUB_BRANCH`, `GITHUB_CLIENT_ID`,
 * `GITHUB_CLIENT_SECRET` y `SESSION_SECRET`: los restos del admin de CMS que
 * este repo tuvo y ya no tiene. Al declararlos (theme#48) se midió que **no los
 * leía nadie** —`git log --all -S` daba 0 commits para cuatro de ellos, y el
 * quinto solo se lee con `process.env` en build—, y JC decidió retirarlos. Se
 * borraron del Worker el **6-sep-2026 a las 20:40**; comprobado después:
 * `wrangler secret list` devuelve `[]`.
 *
 * El porqué, el qué era cada uno y qué queda pendiente (revocar la OAuth App de
 * GitHub) están en `docs/ROTACION-SECRETOS.md`. No se reponen sin leer eso.
 *
 * PARA QUÉ SIGUE EXISTIENDO ESTO con cero secretos que subir: `--check` cruza
 * lo declarado con lo que el Worker tiene DE VERDAD, así que el día que alguien
 * haga un `wrangler secret put` a mano, sale como **sin declarar** y hay que
 * venir aquí a decir qué es. Un contrato vacío sigue siendo un contrato.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** Cómo se rota, que es lo que decide el procedimiento. */
export type Clase =
  /** No es un secreto: es configuración. Va a 1Password igual, sin rotar. */
  | 'configuracion'
  /** Lo emite un tercero; se copia de su consola, no se inventa. */
  | 'de-tercero'
  /** Lo inventamos nosotros y lo comparte una contraparte: rotar coordinado. */
  | 'hmac-compartido'
  /** Solo nuestro, sin contraparte: se rota cuando se quiera. */
  | 'propio'
  /** Rotarlo rompe algo ya emitido o ya guardado. Ver docs/ROTACION-SECRETOS.md. */
  | 'peligroso'

export interface Secreto {
  nombre: string
  clase: Clase
  /** Qué es, en una línea. */
  que: string
  /** Otros Workers que llevan el MISMO valor, con el nombre que usan allí. */
  compartidoCon?: string[]
  /**
   * TRANSITORIO: solo existe MIENTRAS dura una rotación, y su ausencia es el
   * estado normal. Cambia lo que significa que falte:
   *
   *  - en 1Password → se sube, como cualquier otro;
   *  - en ninguno de los dos → no es una falta, es que no hay rotación abierta;
   *  - **solo en el Worker → aviso**: la rotación se quedó a medio cerrar y el
   *    valor viejo sigue sirviendo. Quitarlo de 1Password NO lo quita de
   *    Cloudflare: hay que ir con `wrangler secret delete`.
   */
  transitorio?: true
}

export const SECRETOS: readonly Secreto[] = [
  // ── Solo CI: vive en 1Password y en los secrets de GitHub, NO en el Worker ─
  {
    nombre: 'CF_API_TOKEN',
    clase: 'de-tercero',
    que: 'El token de Cloudflare con el que se despliega este site. Está en `op://Saastro/saastro-theme-prod` desde el 21-jun-2026 y su pareja en los secrets de GitHub del repo como CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID), creados el mismo día. NO se sube al Worker: el Worker no despliega nada. Dos cosas medidas el 6-sep-2026 y pendientes: el nombre del campo en 1Password no coincide con el de su consumidor (doctrina §Items dice que el campo se llama como la variable), y ningún workflow lo usa todavía — el deploy de este repo es manual.',
  },
]

export const NOMBRES: readonly string[] = SECRETOS.map((s) => s.nombre)

/**
 * Lo que NO lee el Worker: vive en 1Password y en los secrets de GitHub.
 *
 * Que el Worker no lo tenga es lo CORRECTO, y contarlo como «falta» pondría
 * `--check` en un rojo permanente — que es como muere un control.
 *
 * `CF_API_TOKEN` es el token de despliegue: está en el item de prod desde el
 * 21-jun-2026 y su pareja en los secrets de GitHub del repo
 * (`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`, mismo día). Hoy no lo
 * consume ningún workflow, pero su sitio es éste y no el Worker.
 */
export const SOLO_CI: readonly string[] = ['CF_API_TOKEN']

/**
 * Los que solo existen durante una rotación. Que falten es lo normal, así que
 * `--check` no los cuenta como hueco — pero si están en el Worker y ya no en
 * 1Password, avisa: eso es una rotación sin cerrar.
 *
 * Vacío hoy: la ventana de doble clave del Hub (hub#491) existe porque allí hay
 * filas cifradas que re-cifrar. Aquí no hay ninguna, así que no hay `_PREVIOUS`
 * que declarar. El mecanismo se queda montado por si algún día lo hay.
 */
export const TRANSITORIOS: readonly string[] = SECRETOS.filter((s) => s.transitorio).map(
  (s) => s.nombre,
)

/** Los permanentes: los que SIEMPRE tienen que estar en los dos sitios. */
export const PERMANENTES: readonly string[] = NOMBRES.filter((n) => !TRANSITORIOS.includes(n))

/** Los que sube `sync-secrets` al Worker (todos menos los de CI). */
export const DEL_WORKER: readonly string[] = NOMBRES.filter((n) => !SOLO_CI.includes(n))
