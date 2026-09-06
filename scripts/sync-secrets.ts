/**
 * `pnpm sync-secrets` — copia los secretos de 1Password al Worker, y
 * `--check` dice qué falta en cada lado sin tocar nada.
 *
 * LA DOCTRINA (office `ecosistema/41-SECRETOS.md`, 5-sep-2026): un secreto vive
 * en UN sitio, 1Password. Lo que hay en Cloudflare es una copia escrita por
 * script, nunca a mano. Lo que no está en 1Password no existe: no se puede
 * rotar, no se puede auditar, y el día que hace falta nadie sabe de dónde salió.
 *
 * QUÉ HACE EXACTAMENTE. Lee `op://Saastro/saastro-theme-prod/<CAMPO>` para los
 * nombres declarados en `secretos.ts` y los pasa a `wrangler secret bulk` POR
 * STDIN. No escribe ningún fichero, no deja el valor en `argv` (que es visible
 * en `ps`) y no lo imprime nunca — ni siquiera al fallar. Lo único que sale por
 * pantalla son NOMBRES.
 *
 * `--check` es lo que se usa el 99% de las veces: cruza tres listas —lo
 * declarado aquí, los campos con valor del item, y lo que el Worker tiene según
 * `wrangler secret list`— y dice qué falta dónde. No pide confirmación porque no
 * cambia nada.
 *
 * MOLDE: `saastro-hub/apps/hub-react/scripts/sync-secrets.ts` (#489, #492). Se
 * copia entero a propósito —el cruce es el mismo— salvo lo que aquí se midió
 * distinto: este Worker no tiene entornos, así que va sin `--env`.
 *
 * NO ROTA NADA. Subir el mismo valor que ya está es un no-op para el consumidor;
 * cambiar el valor es rotar, y eso tiene su procedimiento por secreto en
 * `docs/ROTACION-SECRETOS.md`. Este script es el transporte, no la política.
 */

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { DEL_WORKER, NOMBRES, SECRETOS, SOLO_CI, TRANSITORIOS } from './secretos.ts'

const VAULT = 'Saastro'
const ITEM = 'saastro-theme-prod'
/**
 * `saastro-theme` NO tiene entornos: ni el `wrangler.jsonc` del repo ni el
 * `dist/server/wrangler.json` con el que se despliega declaran `env`. El molde
 * (hub-react) pasa `--env production` en todas las llamadas a wrangler; copiarlo
 * aquí habría apuntado a un entorno que no existe. Comprobado el 6-sep-2026
 * ANTES de copiar, que es la única forma de que un molde no arrastre su contexto.
 */
/** `op` puede pedir desbloqueo; no queremos colgarnos para siempre. */
const OP_TIMEOUT_MS = 60_000

// ── El cruce, que es la parte que se puede probar ────────────────────────────

export interface Cruce {
  /** Declarados aquí que el item de 1Password no tiene (o tiene vacíos). */
  faltanEn1P: string[]
  /** Declarados y en 1Password, pero que el Worker no tiene. */
  faltanEnWorker: string[]
  /** El Worker los tiene y aquí no están declarados: nadie sabe qué son. */
  sinDeclarar: string[]
  /**
   * TRANSITORIOS que el Worker tiene y 1Password ya no: una rotación a medio
   * cerrar. No es un fallo del sync —hay que ir y retirarlos—, pero mientras
   * estén, el valor VIEJO sigue sirviendo. Y quitarlo de 1Password no lo quita
   * de Cloudflare: hace falta `wrangler secret delete`.
   */
  porRetirar: string[]
  /** Todo en su sitio. */
  listos: string[]
}

/**
 * Cruza las tres listas. Es una función pura a propósito: el valor de esto está
 * en la tabla de verdad, y una tabla de verdad que solo se puede comprobar
 * teniendo 1Password abierto y el Worker desplegado no se comprueba nunca.
 *
 * `soloCi` son los que viven en 1Password pero NO en el Worker (el token de
 * despliegue de la CI): que el Worker no los tenga es lo correcto, y contarlos
 * como «falta» convertiría el check en un rojo permanente que se aprende a
 * ignorar — que es como muere un control.
 */
export function cruzar(entrada: {
  declarados: readonly string[]
  conValorEn1P: readonly string[]
  enWorker: readonly string[]
  soloCi?: readonly string[]
  /** Los que solo existen durante una rotación: ver `secretos.ts`. */
  transitorios?: readonly string[]
}): Cruce {
  const soloCi = new Set(entrada.soloCi ?? [])
  const transitorios = new Set(entrada.transitorios ?? [])
  const en1P = new Set(entrada.conValorEn1P)
  const enWorker = new Set(entrada.enWorker)
  const declarados = new Set(entrada.declarados)

  const faltanEn1P: string[] = []
  const faltanEnWorker: string[] = []
  const porRetirar: string[] = []
  const listos: string[] = []

  for (const n of entrada.declarados) {
    if (!en1P.has(n)) {
      // Un transitorio ausente de los DOS lados es el estado normal: no hay
      // rotación abierta. Contarlo como hueco pondría el check en rojo
      // permanente, y un rojo permanente se aprende a ignorar.
      if (transitorios.has(n)) {
        if (enWorker.has(n)) porRetirar.push(n)
        continue
      }
      faltanEn1P.push(n)
      continue
    }
    if (!soloCi.has(n) && !enWorker.has(n)) {
      faltanEnWorker.push(n)
      continue
    }
    listos.push(n)
  }

  const sinDeclarar = [...enWorker].filter((n) => !declarados.has(n)).sort()
  return { faltanEn1P, faltanEnWorker, sinDeclarar, porRetirar, listos }
}

/**
 * ¿Hay algo que PIDA ACCIÓN? Es el código de salida, con nombre y con tests.
 *
 * Doctrina (`41-SECRETOS.md` §Cómo se comprueba): «el código de salida es una
 * función con nombre y tests: lo que se lee en pantalla no es lo que comprueba
 * la máquina». Escrito como expresión suelta dentro de `main`, lo único que
 * podía comprobarlo era leerlo — y hasta hoy decía 0 con un `_PREVIOUS`
 * olvidado en el Worker, que es justo el caso que deja una rotación abierta sin
 * que nadie se entere.
 *
 * Cuenta lo que hay que ir a arreglar:
 *   - falta en 1Password        → no se puede rotar ni restaurar
 *   - falta en el Worker        → está en 1P y no ha llegado: `sync-secrets`
 *   - `_PREVIOUS` por retirar   → rotación a medio cerrar; el valor viejo sigue
 *                                 abriendo datos
 *
 * Y NO cuenta `sinDeclarar`: un secreto puesto a mano se ENSEÑA, pero si
 * contara, cualquier experimento dejaría el CI en rojo hasta que alguien
 * aprendiera a ignorarlo — y un rojo que se ignora ya no es un control.
 */
export function pideAccion(cruce: Cruce): boolean {
  return (
    cruce.faltanEn1P.length > 0 ||
    cruce.faltanEnWorker.length > 0 ||
    cruce.porRetirar.length > 0
  )
}

/** ¿Puede `sync` hacer algo útil? Sin esto imprimiría «0 subidos» y un 0 de salida. */
export function haySincronizables(cruce: Cruce): boolean {
  return cruce.faltanEnWorker.length > 0 || cruce.listos.length > 0
}

// ── Lo que habla con el mundo ────────────────────────────────────────────────

/** Un campo del item tal como lo devuelve `op item get --format json`. */
export interface CampoOp {
  label?: string
  /** AUSENTE cuando el campo existe pero está vacío. No es lo mismo que ''. */
  value?: string
}

/**
 * Las ETIQUETAS del item que tienen valor. Devuelve nombres, nunca valores.
 *
 * Que esto no devuelva valores no es una promesa: es la razón de que exista
 * aparte de `valoresDelItem`. `--check` corre a diario y no necesita un solo
 * secreto para hacer su trabajo, así que no se le da ninguno — el control que
 * no puede filtrar es el que no tiene qué filtrar.
 */
export function etiquetasConValor(campos: readonly CampoOp[]): string[] {
  return campos.filter((c) => c.label && c.value).map((c) => c.label!)
}

/**
 * Los valores, solo para el camino que sube. Se pide por nombre para no
 * arrastrar de vuelta los campos de plantilla de la categoría API Credential
 * (`username`, `credential`, `expires`…), que no son secretos nuestros.
 */
export function valoresDelItem(
  campos: readonly CampoOp[],
  nombres: readonly string[],
): Map<string, string> {
  const quiero = new Set(nombres)
  const out = new Map<string, string>()
  for (const c of campos) {
    if (c.label && c.value && quiero.has(c.label)) out.set(c.label, c.value)
  }
  return out
}

/**
 * El item ENTERO, de una sola llamada.
 *
 * POR QUÉ NO `--fields`. Así estaba escrito hasta el 5-sep-2026 y era un fallo
 * de bulto: `op item get --fields A,B,C` **aborta** si uno de los campos no
 * existe («"GEN_EMAIL_FROM" isn't a field in the item»). O sea que `--check`,
 * cuyo único trabajo es decir qué campos faltan, no podía correr precisamente
 * cuando faltaba alguno — que hoy es el caso normal, con 13 sin poner. Un
 * control que no funciona en el caso para el que existe no es un control.
 *
 * Y devuelve valores SIEMPRE, con sesión abierta y sin `--reveal`. Por eso este
 * comando no se teclea nunca en una terminal cuya salida alguien lee, y por eso
 * lo que sale de aquí se convierte en etiquetas antes de nada.
 */
export function leerItem(): CampoOp[] {
  const raw = execFileSync(
    'op',
    ['item', 'get', ITEM, '--vault', VAULT, '--format', 'json'],
    { encoding: 'utf8', timeout: OP_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const item = JSON.parse(raw) as { fields?: CampoOp[] }
  return item.fields ?? []
}

/** Lo que el Worker tiene HOY, que es la única fuente sobre el otro lado. */
export function listarDelWorker(): string[] {
  const raw = execFileSync(
    'pnpm',
    ['exec', 'wrangler', 'secret', 'list', '--format', 'json'],
    { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const desde = raw.indexOf('[')
  if (desde < 0) throw new Error('`wrangler secret list` no devolvió JSON')
  return (JSON.parse(raw.slice(desde)) as { name: string }[]).map((s) => s.name)
}

/**
 * Sube por STDIN. Nunca por fichero ni por argumento: un fichero temporal se
 * queda en el disco si el proceso muere, y un argumento lo ve cualquiera con
 * `ps`.
 */
export function subirAlWorker(valores: Map<string, string>): void {
  const cuerpo = JSON.stringify(Object.fromEntries(valores))
  execFileSync('pnpm', ['exec', 'wrangler', 'secret', 'bulk'], {
    input: cuerpo,
    // stdout a 'inherit' para ver el progreso de wrangler, que no imprime valores.
    stdio: ['pipe', 'inherit', 'inherit'],
    timeout: 120_000,
  })
}

// ── La pantalla ──────────────────────────────────────────────────────────────

const clase = (n: string) => SECRETOS.find((s) => s.nombre === n)?.clase ?? '?'

function pintar(cruce: Cruce): void {
  const linea = (n: string) => `    ${n}  (${clase(n)})`

  if (cruce.listos.length > 0) {
    console.log(`\n  ✓ ${cruce.listos.length} en su sitio (1Password y Worker)`)
  }
  if (cruce.faltanEn1P.length > 0) {
    console.log(`\n  ✗ ${cruce.faltanEn1P.length} SIN VALOR EN 1PASSWORD — no se pueden rotar ni restaurar:`)
    console.log(cruce.faltanEn1P.map(linea).join('\n'))
    console.log(`\n    Cómo se meten, uno por uno: docs/ROTACION-SECRETOS.md`)
  }
  if (cruce.faltanEnWorker.length > 0) {
    console.log(`\n  ✗ ${cruce.faltanEnWorker.length} en 1Password pero NO en el Worker:`)
    console.log(cruce.faltanEnWorker.map(linea).join('\n'))
    console.log(`\n    Se arregla con: pnpm sync-secrets`)
  }
  if (cruce.porRetirar.length > 0) {
    console.log(
      `\n  ⚠ ${cruce.porRetirar.length} rotación(es) SIN CERRAR — el Worker los tiene y 1Password ya no:`,
    )
    console.log(cruce.porRetirar.map(linea).join('\n'))
    console.log(
      `\n    Mientras estén, el valor VIEJO sigue sirviendo. Quitarlos de 1Password NO` +
        `\n    los quita de Cloudflare: \`wrangler secret delete <NOMBRE>\`,` +
        `\n    y solo cuando la rotación esté comprobada.`,
    )
  }
  if (cruce.sinDeclarar.length > 0) {
    console.log(`\n  ⚠ ${cruce.sinDeclarar.length} en el Worker SIN DECLARAR en scripts/secretos.ts:`)
    console.log(cruce.sinDeclarar.map((n) => `    ${n}`).join('\n'))
    console.log(`\n    O se declaran (con qué son y quién los comparte) o se borran del Worker.`)
  }
}

/**
 * Los mensajes con los que `op` dice que no hay sesión. Son suyos, verificados
 * en el CLI 2.39: `op whoami` sin sesión responde
 * «[ERROR] … account is not signed in».
 */
const DUPLICADO = /More than one item matches/i

const SIN_SESION = [
  /account is not signed in/i,
  /you are not currently signed in/i,
  /session (has )?expired/i,
  /authorization prompt (was )?dismissed/i,
]

/**
 * Traduce SOLO lo que sé traducir. Todo lo demás se enseña tal cual.
 *
 * Así estaba mal escrito hasta el 5-sep-2026: cualquier salida no-cero de `op`
 * se contaba como «la sesión no está activa», así que un item que no existe o
 * un campo mal escrito se anunciaban como un problema de sesión — y quien lo
 * leía se ponía a hacer `op signin` con la sesión ya abierta. **Un diagnóstico
 * que no te has ganado es peor que no dar ninguno**: manda a la persona en la
 * dirección contraria con la autoridad de un mensaje de error.
 */
export function explicar(err: unknown): string {
  const e = err as { code?: string; stderr?: Buffer | string | null; message?: string }
  const stderr = String(e?.stderr ?? '').trim()

  if (e?.code === 'ENOENT') {
    return 'no está instalado el CLI de 1Password (`op`). Instálalo con `brew install 1password-cli`.'
  }
  if (DUPLICADO.test(stderr)) {
    // MEDIDO el 6-sep-2026: en la bóveda `Saastro` hay DOS items titulados
    // `saastro-theme-prod` —el de 2026-06-21 (categoría Password, con un
    // CF_API_TOKEN) y uno vacío creado hoy— y `op item get` por título aborta
    // en vez de elegir. Sin esta rama, ese error caía en el «no hay sesión» de
    // abajo y mandaba a hacer `op signin` con la sesión abierta, que es
    // exactamente el fallo que este script arregló en el Hub (#489).
    return (
      'hay MÁS DE UN item con ese título en la bóveda, y `op` no elige por ti.\n' +
      '    Archiva el duplicado (Doctrina §Items: un item por consumidor) y vuelve\n' +
      '    a correrlo. Los ids los dice el propio error, arriba.'
    )
  }
  if (SIN_SESION.some((re) => re.test(stderr))) {
    return 'la sesión de 1Password no está activa. Ábrela con:\n\n    eval $(op signin)\n'
  }
  // Lo que dijo op, sin interpretarlo. Si no sé qué es, lo dice él y no yo.
  return stderr || (err instanceof Error ? err.message : String(err))
}

function main(argv: readonly string[]): number {
  const soloComprobar = argv.includes('--check')

  console.log(`  op://${VAULT}/${ITEM}  →  worker saastro-theme`)

  let campos: CampoOp[]
  let enWorker: string[]
  try {
    campos = leerItem()
  } catch (err) {
    console.error(`\n  No he podido leer 1Password: ${explicar(err)}`)
    return 2
  }
  try {
    enWorker = listarDelWorker()
  } catch (err) {
    console.error(`\n  No he podido listar los secretos del Worker: ${explicar(err)}`)
    return 2
  }
  const cruce = cruzar({
    declarados: NOMBRES,
    conValorEn1P: etiquetasConValor(campos),
    enWorker,
    soloCi: SOLO_CI,
    transitorios: TRANSITORIOS,
  })
  pintar(cruce)

  if (soloComprobar) {
    // Que falte algo en 1Password es el estado que hay que arreglar, y un
    // código de salida distinto de 0 es lo que hace que un CI se entere.
    return pideAccion(cruce) ? 1 : 0
  }

  // Los valores se piden AQUÍ y no antes: en `--check` esta línea no se ejecuta,
  // así que ese camino no llega a tener un secreto en la mano en ningún momento.
  const subibles = valoresDelItem(campos, DEL_WORKER)
  if (subibles.size === 0) {
    console.log('\n  Nada que subir: 1Password no tiene ninguno de los declarados.')
    return 1
  }

  console.log(`\n  Subiendo ${subibles.size}: ${[...subibles.keys()].join(', ')}`)
  try {
    subirAlWorker(subibles)
  } catch (err) {
    console.error(`\n  La subida ha fallado: ${explicar(err)}`)
    return 2
  }
  console.log('\n  Hecho. Los que faltan en 1Password siguen faltando: no se inventan.')
  return 0
}

// Solo cuando se ejecuta, no cuando lo importa un test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)))
}
