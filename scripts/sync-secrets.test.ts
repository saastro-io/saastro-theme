/**
 * El cruce de `sync-secrets` de `saastro-theme`, con las listas de verdad del
 * 6-sep-2026.
 *
 * POR QUÉ SE PRUEBA ESTO Y NO EL `execFileSync`. Lo que puede estar mal aquí no
 * es llamar a `op` —eso falla ruidosamente— sino la TABLA DE VERDAD: qué cuenta
 * como «falta», qué cuenta como «sobra» y qué no cuenta. Y una tabla de verdad
 * que solo se puede comprobar con 1Password abierto y el Worker desplegado no
 * se comprueba nunca: se firma.
 *
 * Molde: `saastro-hub/apps/hub-react/scripts/sync-secrets.test.ts`.
 */

import { describe, expect, it } from 'vitest'
import {
  cruzar,
  etiquetasConValor,
  explicar,
  haySincronizables,
  pideAccion,
  valoresDelItem,
  type CampoOp,
} from './sync-secrets.ts'
import {
  DEL_WORKER,
  NOMBRES,
  PERMANENTES,
  SECRETOS,
  SIN_CONSUMIDOR,
  SOLO_CI,
  TRANSITORIOS,
} from './secretos.ts'

/**
 * `pnpm exec wrangler secret list` del Worker `saastro-theme`, MEDIDO el
 * 6-sep-2026. Son cinco. Sin `--env` porque este Worker no tiene entornos.
 */
const EN_WORKER = [
  'ENCRYPTION_KEY',
  'GITHUB_BRANCH',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'SESSION_SECRET',
]

/**
 * El lado de 1Password NO ESTÁ MEDIDO, y por eso no se finge que lo esté.
 * Leerlo pide `op item get`, que devuelve VALORES; la doctrina
 * (`41-SECRETOS.md`) prohíbe teclearlo en una terminal cuya salida se lee. El
 * item nace vacío: lo crea JC. Así que estos tests NO afirman «hoy faltan
 * estos N» — fijan la tabla de verdad del cruce, que es lo que puede estar mal
 * en el código. El estado real lo dice `pnpm sync-secrets --check`.
 */
const ALGUNOS_EN_1P = ['ENCRYPTION_KEY', 'SESSION_SECRET']

const escenario = () =>
  cruzar({
    declarados: NOMBRES,
    conValorEn1P: ALGUNOS_EN_1P,
    enWorker: EN_WORKER,
    soloCi: SOLO_CI,
    transitorios: TRANSITORIOS,
  })

describe('lo que SÍ está medido: la lista del Worker', () => {
  it('los 5 del Worker están todos declarados: ninguno sin dueño', () => {
    expect(escenario().sinDeclarar).toEqual([])
  })

  it('y no se declara ningún PERMANENTE que el Worker no tenga', () => {
    // Un nombre inventado en `secretos.ts` saldría como «falta en el Worker»
    // para siempre, y un rojo permanente se aprende a ignorar. `SOLO_CI` se
    // resta: no estar en el Worker es su estado correcto.
    const delWorker = PERMANENTES.filter((n) => !SOLO_CI.includes(n))
    expect(delWorker.filter((n) => !EN_WORKER.includes(n))).toEqual([])
  })

  it('lo que no está en 1Password sale como que falta, no como que está', () => {
    const c = escenario()
    for (const n of PERMANENTES) {
      if (ALGUNOS_EN_1P.includes(n)) expect(c.listos).toContain(n)
      else expect(c.faltanEn1P).toContain(n)
    }
  })
})

describe('el cruce dice la verdad en los casos que importan', () => {
  it('un secreto puesto a mano en el Worker sale como SIN DECLARAR', () => {
    const c = cruzar({
      declarados: NOMBRES,
      conValorEn1P: ALGUNOS_EN_1P,
      enWorker: [...EN_WORKER, 'SECRETO_QUE_ALGUIEN_PUSO'],
      soloCi: SOLO_CI,
    })
    expect(c.sinDeclarar).toEqual(['SECRETO_QUE_ALGUIEN_PUSO'])
  })

  it('uno en 1Password que el Worker no tiene sale como «falta en el Worker»', () => {
    const c = cruzar({
      declarados: NOMBRES,
      conValorEn1P: ALGUNOS_EN_1P,
      enWorker: EN_WORKER.filter((n) => n !== 'ENCRYPTION_KEY'),
      soloCi: SOLO_CI,
    })
    expect(c.faltanEnWorker).toEqual(['ENCRYPTION_KEY'])
    expect(c.listos).not.toContain('ENCRYPTION_KEY')
  })

  it('un campo VACÍO en 1Password cuenta como que falta, no como que está', () => {
    // `etiquetasConValor` solo devuelve los campos CON valor: un campo creado y
    // sin rellenar es exactamente el caso que este script viene a cazar, y
    // contarlo como presente sería firmar la casilla.
    const c = cruzar({
      declarados: NOMBRES,
      conValorEn1P: ALGUNOS_EN_1P.filter((n) => n !== 'SESSION_SECRET'),
      enWorker: EN_WORKER,
      soloCi: SOLO_CI,
    })
    expect(c.faltanEn1P).toContain('SESSION_SECRET')
    expect(c.listos).not.toContain('SESSION_SECRET')
  })

  it('el día que todo esté bien, las tres listas de fallo quedan vacías', () => {
    const c = cruzar({
      declarados: NOMBRES,
      conValorEn1P: NOMBRES,
      enWorker: [...DEL_WORKER],
      soloCi: SOLO_CI,
    })
    expect(c).toMatchObject({ faltanEn1P: [], faltanEnWorker: [], sinDeclarar: [] })
    expect(c.listos).toHaveLength(NOMBRES.length)
    expect(haySincronizables(c)).toBe(true)
  })
})

/**
 * El código de salida, que es lo único que mira una máquina. Doctrina
 * (`41-SECRETOS.md` §Cómo se comprueba): «lo que se lee en pantalla no es lo
 * que comprueba la máquina».
 */
describe('el código de salida de --check', () => {
  it('con el item vacío pide acción: es el estado de HOY, y --check tiene que decirlo', () => {
    // El item lo crea JC vacío. Si esto saliera 0, el encargo se daría por
    // hecho sin que ningún secreto esté en 1Password.
    const c = cruzar({
      declarados: NOMBRES,
      conValorEn1P: [],
      enWorker: EN_WORKER,
      soloCi: SOLO_CI,
      transitorios: TRANSITORIOS,
    })
    expect(c.faltanEn1P).toHaveLength(NOMBRES.length)
    expect(pideAccion(c)).toBe(true)
  })

  it('todo en su sitio NO pide acción', () => {
    const c = cruzar({
      declarados: NOMBRES,
      conValorEn1P: NOMBRES,
      enWorker: [...DEL_WORKER],
      soloCi: SOLO_CI,
      transitorios: TRANSITORIOS,
    })
    expect(pideAccion(c)).toBe(false)
  })

  it('un secreto puesto a mano se ENSEÑA pero NO pide acción', () => {
    // Si contara, cualquier experimento dejaría el CI en rojo hasta que
    // alguien aprendiera a ignorarlo — y un rojo que se ignora no es control.
    const c = cruzar({
      declarados: NOMBRES,
      conValorEn1P: NOMBRES,
      enWorker: [...DEL_WORKER, 'EXPERIMENTO'],
      soloCi: SOLO_CI,
      transitorios: TRANSITORIOS,
    })
    expect(c.sinDeclarar).toEqual(['EXPERIMENTO'])
    expect(pideAccion(c)).toBe(false)
  })

  it('un transitorio olvidado en el Worker SÍ pide acción', () => {
    // Hoy no hay transitorios declarados aquí (no hay nada cifrado que
    // re-cifrar), así que se prueba el mecanismo con uno inventado: es la
    // parte del molde que hub#492 arregló, y tiene que seguir viva si algún
    // día este repo abre una ventana de rotación.
    const c = cruzar({
      declarados: ['UNO', 'UNO_PREVIOUS'],
      conValorEn1P: ['UNO'],
      enWorker: ['UNO', 'UNO_PREVIOUS'],
      transitorios: ['UNO_PREVIOUS'],
    })
    expect(c.porRetirar).toEqual(['UNO_PREVIOUS'])
    expect(c.faltanEn1P).toEqual([])
    expect(pideAccion(c)).toBe(true)
  })

  it('y un transitorio ausente de los dos lados es lo normal: no pide acción', () => {
    const c = cruzar({
      declarados: ['UNO', 'UNO_PREVIOUS'],
      conValorEn1P: ['UNO'],
      enWorker: ['UNO'],
      transitorios: ['UNO_PREVIOUS'],
    })
    expect(c.porRetirar).toEqual([])
    expect(pideAccion(c)).toBe(false)
  })
})

describe('el manifiesto es el contrato, así que se comprueba', () => {
  it('los PERMANENTES del Worker son exactamente los 5 medidos: ni uno más, ni uno menos', () => {
    // Se resta SOLO_CI: `CF_API_TOKEN` está declarado y vive en 1Password y en
    // los secrets de GitHub, pero NO en el Worker, y que no esté es lo
    // correcto. Compararlo contra la lista del Worker sin restarlo lo
    // convertiría en un rojo permanente.
    const delWorker = PERMANENTES.filter((n) => !SOLO_CI.includes(n))
    expect(delWorker).toHaveLength(5)
    expect([...delWorker].sort()).toEqual([...EN_WORKER].sort())
  })

  it('CF_API_TOKEN está declarado pero NO se sube al Worker', () => {
    expect(NOMBRES).toContain('CF_API_TOKEN')
    expect(DEL_WORKER).not.toContain('CF_API_TOKEN')
  })

  it('y estando en 1Password cuenta como listo aunque el Worker no lo tenga', () => {
    // La razón de ser de SOLO_CI. Si esto fallara, `--check` saldría 1 para
    // siempre por un secreto que está donde debe.
    const c = cruzar({
      declarados: NOMBRES,
      conValorEn1P: ['CF_API_TOKEN'],
      enWorker: EN_WORKER,
      soloCi: SOLO_CI,
      transitorios: TRANSITORIOS,
    })
    expect(c.listos).toContain('CF_API_TOKEN')
    expect(c.faltanEnWorker).not.toContain('CF_API_TOKEN')
  })

  it('ninguno se declara dos veces', () => {
    expect(new Set(NOMBRES).size).toBe(NOMBRES.length)
  })

  it('todos dicen qué son', () => {
    for (const s of SECRETOS) expect(s.que.length, s.nombre).toBeGreaterThan(30)
  })

  it('los CINCO están marcados como sin consumidor, que es el hallazgo de este PR', () => {
    // Medido el 6-sep-2026: `git log --all -S<nombre>` da 0 commits para
    // cuatro de ellos y el quinto (GITHUB_BRANCH) solo se lee con process.env
    // en build. El día que alguien cablee uno o lo retire del Worker, esta
    // cuenta cambia y hay que venir a `secretos.ts` a decirlo — que es para lo
    // que se cuenta y no se deja como frase en un comentario.
    expect(SIN_CONSUMIDOR).toHaveLength(5)
    expect([...SIN_CONSUMIDOR].sort()).toEqual([...EN_WORKER].sort())
  })

  it('ENCRYPTION_KEY NO se clasifica como peligroso aquí', () => {
    // En hub-react sí lo es: cifra site_integrations.config_encrypted y
    // rotarlo deja ilegible lo guardado. Aquí el Worker no tiene D1, KV ni R2,
    // así que no abre nada y rotarlo no rompe nada. Copiar la clase del molde
    // por parecerse el nombre habría inventado una migración.
    expect(SECRETOS.find((s) => s.nombre === 'ENCRYPTION_KEY')?.clase).toBe('propio')
    expect(SECRETOS.filter((s) => s.clase === 'peligroso')).toEqual([])
  })
})

describe('las piezas que tocan a 1Password no devuelven valores de más', () => {
  const campos: CampoOp[] = [
    { label: 'ENCRYPTION_KEY', value: 'x' },
    { label: 'SESSION_SECRET' }, // creado y vacío
    { label: 'username', value: 'plantilla de API Credential' },
  ]

  it('etiquetasConValor devuelve NOMBRES, y solo los que tienen valor', () => {
    expect(etiquetasConValor(campos)).toEqual(['ENCRYPTION_KEY', 'username'])
  })

  it('valoresDelItem se queda solo con los declarados: la plantilla no viaja', () => {
    const v = valoresDelItem(campos, NOMBRES)
    expect([...v.keys()]).toEqual(['ENCRYPTION_KEY'])
  })
})

describe('los diagnósticos que no se ha ganado no se dan', () => {
  it('sin `op` instalado lo dice, y dice cómo instalarlo', () => {
    expect(explicar({ code: 'ENOENT' })).toContain('1password-cli')
  })

  it('un item que no existe NO se anuncia como problema de sesión', () => {
    // El fallo del molde antes de hub#489: cualquier salida no-cero se contaba
    // como «no hay sesión», y mandaba a hacer `op signin` con la sesión abierta.
    const msg = explicar({ stderr: '[ERROR] "saastro-theme-prod" isn\'t an item' })
    expect(msg).not.toContain('signin')
    expect(msg).toContain("isn't an item")
  })

  it('dos items con el mismo título se diagnostican como tal, no como falta de sesión', () => {
    // Es el estado REAL del 6-sep-2026 en la bóveda Saastro: dos
    // `saastro-theme-prod`. El mensaje es el de `op` 2.39, copiado literal.
    const msg = explicar({
      stderr:
        '[ERROR] More than one item matches "saastro-theme-prod". Try again and specify the item by its ID:',
    })
    expect(msg).toContain('MÁS DE UN item')
    expect(msg).not.toContain('signin')
  })

  it('y sin sesión sí lo dice', () => {
    expect(explicar({ stderr: '[ERROR] account is not signed in' })).toContain('op signin')
  })
})
