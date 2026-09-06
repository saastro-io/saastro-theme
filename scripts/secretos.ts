/**
 * Los 5 secretos del Worker `saastro-theme`, declarados: qué es cada uno, quién
 * más lo tiene, y si se puede rotar solo.
 *
 * ESTA LISTA ES EL CONTRATO. `sync-secrets` no descubre nada: sube exactamente
 * lo que aquí se declara, leyéndolo de `op://Saastro/saastro-theme-prod/<CAMPO>`.
 * Si un secreto no está aquí, no se sube; si está aquí y no está en 1Password,
 * `--check` lo dice. Los dos lados se cruzan contra `wrangler secret list`, que
 * es lo que de verdad tiene el Worker.
 *
 * Molde: `saastro-hub/apps/hub-react/scripts/secretos.ts` (#489, #492). Misma
 * forma a propósito — dos repos que resuelven el mismo problema de dos maneras
 * acaban teniendo dos comportamientos que nadie sabe cuál es el bueno.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LO PRIMERO, PORQUE CAMBIA CÓMO SE LEE TODO LO DEMÁS: LOS CINCO ESTÁN EN EL
 * WORKER Y NINGUNO TIENE CONSUMIDOR EN ESTE REPO.
 *
 * Medido el 6-sep-2026, y no deducido:
 *   - `grep` de los cinco nombres en todo el repo (ts/tsx/astro/mjs/json/md):
 *     solo aparece `GITHUB_BRANCH`, y en `saastrocms.config.ts:44`, leído con
 *     `process.env` — o sea en BUILD, no del `env` del Worker;
 *   - `git log --all -S<nombre>`: **0 commits en toda la historia** para
 *     ENCRYPTION_KEY, SESSION_SECRET, GITHUB_CLIENT_ID y GITHUB_CLIENT_SECRET.
 *     Nunca han estado en el código de este repo;
 *   - ninguno aparece en el bundle construido (`dist/server`);
 *   - el config con el que se despliega de verdad (`dist/server/wrangler.json`,
 *     que es el que usa `pnpm run deploy`) trae `d1_databases: []`,
 *     `kv_namespaces: []`, `r2_buckets: []` y `vars: {}`. El Worker solo sirve
 *     assets estáticos.
 *
 * Tienen pinta de ser los restos del admin del CMS que este repo llegó a tener
 * y ya no tiene (el propio `saastrocms.config.ts` dice que el site «no depende
 * de @saastro/cms»): CLIENT_ID + CLIENT_SECRET + SESSION_SECRET + una clave de
 * cifrado es exactamente la forma de un backend OAuth de CMS.
 *
 * NO SE BORRAN DESDE AQUÍ. Retirar secretos de producción es de JC, y este
 * encargo era explícitamente sin rotar y sin deploy. Se declaran con lo que son
 * —incluido que hoy no los lee nadie— para que el hueco esté escrito y con
 * fecha, que es justo lo que la doctrina pide que no se quede en la memoria de
 * nadie. La decisión de quitarlos va en `docs/ROTACION-SECRETOS.md`.
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
  /**
   * Está en el Worker y NADIE lo lee en este repo (medido, con la prueba en el
   * `que:`). No cambia lo que hace `sync-secrets` —se sigue declarando y
   * cruzando— pero sí lo que significa rotarlo: rotar algo que no lee nadie no
   * arregla nada, y la pregunta de verdad es por qué sigue puesto.
   *
   * Existe como campo y no como frase suelta para que se pueda CONTAR: el test
   * fija cuántos hay, así que el día que alguien cablee uno o lo retire, la
   * cuenta cambia y hay que venir aquí a decirlo.
   */
  sinConsumidor?: true
}

export const SECRETOS: readonly Secreto[] = [
  // ── Configuración: no son secretos, pero viven donde los secretos ──────────
  {
    nombre: 'GITHUB_BRANCH',
    clase: 'configuracion',
    sinConsumidor: true,
    que: 'La rama del repo de contenido para el CMS. Es un nombre de rama, no una credencial. Único de los cinco que aparece en el repo (saastrocms.config.ts:44) y aun así NO lo lee el Worker: se lee con `process.env` en build, así que ponerlo como secreto de Cloudflare no le llega a nadie.',
  },
  {
    nombre: 'GITHUB_CLIENT_ID',
    clase: 'configuracion',
    sinConsumidor: true,
    que: 'El identificador público de una OAuth App de GitHub (la mitad que viaja en la URL de autorización). No es secreto por sí mismo. 0 commits en toda la historia del repo: no lo lee nadie aquí.',
  },

  // ── De terceros: se copian de su consola ───────────────────────────────────
  {
    nombre: 'GITHUB_CLIENT_SECRET',
    clase: 'de-tercero',
    sinConsumidor: true,
    que: 'La mitad secreta de esa OAuth App de GitHub; se rota y se revoca en la propia app de GitHub, no aquí. 0 commits en toda la historia del repo. Es el único de los cinco cuya fuga daría acceso a algo de un tercero, así que si se queda sin consumidor, se revoca en GitHub además de borrarlo del Worker.',
  },

  // ── Solo nuestros ─────────────────────────────────────────────────────────
  {
    nombre: 'SESSION_SECRET',
    clase: 'propio',
    sinConsumidor: true,
    que: 'Firmaba las sesiones del admin del CMS que este repo ya no tiene. Sin contraparte: rotarlo no coordina con nadie. 0 commits en toda la historia del repo.',
  },
  {
    nombre: 'ENCRYPTION_KEY',
    // NO es `peligroso` aquí, y la diferencia con el Hub es el motivo de que
    // esta clase exista. En hub-react cifra `site_integrations.config_encrypted`
    // en D1 y rotarlo deja ilegible lo ya guardado. Aquí no hay nada guardado:
    // el Worker de `saastro-theme` no tiene D1, ni KV, ni R2 (comprobado en el
    // config con el que se despliega). Copiar la clase del Hub por parecerse el
    // nombre habría convertido una rotación trivial en una migración imaginaria.
    clase: 'propio',
    sinConsumidor: true,
    que: 'Una clave de cifrado sin nada que cifrar: el Worker no tiene D1, KV ni R2 (d1_databases/kv_namespaces/r2_buckets vacíos en dist/server/wrangler.json, que es el config con el que se despliega), y el nombre no aparece en ningún commit de la historia. 0 filas cifradas. Rotarla no rompe nada porque no abre nada.',
  },

  // ── Solo CI: vive en 1Password y en los secrets de GitHub, NO en el Worker ─
  {
    nombre: 'CF_API_TOKEN',
    clase: 'de-tercero',
    que: 'El token de Cloudflare con el que se despliega este site. Ya estaba en `op://Saastro/saastro-theme-prod` desde el 21-jun-2026 —era el único campo con valor del item— y su pareja está en los secrets de GitHub del repo como CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID), creados el mismo día. NO se sube al Worker: el Worker no despliega nada. OJO a dos cosas medidas el 6-sep-2026: el nombre del campo en 1Password (CF_API_TOKEN) NO coincide con el de su consumidor (CLOUDFLARE_API_TOKEN), contra la doctrina §Items; y ningún workflow lo usa todavía — `.github/workflows/ci.yml` es el único y solo instala, typechequea y corre studio:check.',
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

/** Los que están puestos y no lee nadie. El test fija la cuenta. */
export const SIN_CONSUMIDOR: readonly string[] = SECRETOS.filter((s) => s.sinConsumidor).map(
  (s) => s.nombre,
)
