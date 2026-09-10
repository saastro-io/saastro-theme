/**
 * El cruce de `sync-secrets` de `saastro-theme`, con las listas de verdad del
 * 6-sep-2026 **después** de que JC retirara los cinco secretos sin consumidor.
 *
 * POR QUÉ SE PRUEBA ESTO Y NO EL `execFileSync`. Lo que puede estar mal aquí no
 * es llamar a `op` —eso falla ruidosamente— sino la TABLA DE VERDAD: qué cuenta
 * como «falta», qué cuenta como «sobra» y qué no cuenta. Y una tabla de verdad
 * que solo se puede comprobar con 1Password abierto y el Worker desplegado no
 * se comprueba nunca: se firma.
 *
 * Con el Worker a cero, el trabajo de este script cambia de sentido y por eso
 * los tests cambian con él: ya no vigila que lleguen secretos, vigila que **no
 * aparezca ninguno sin declarar**. Es el caso que antes era secundario.
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
import { DEL_WORKER, NOMBRES, PERMANENTES, SECRETOS, SOLO_CI, TRANSITORIOS } from './secretos.ts'

/**
 * `pnpm exec wrangler secret list` del Worker `saastro-theme`, MEDIDO el
 * 6-sep-2026 a las 20:45: devuelve `[]`.
 *
 * Los cinco que había (ENCRYPTION_KEY, GITHUB_BRANCH, GITHUB_CLIENT_ID,
 * GITHUB_CLIENT_SECRET, SESSION_SECRET) los retiró JC a las 20:40 tras
 * comprobarse en theme#48 que no los leía nadie. El porqué está en
 * `docs/ROTACION-SECRETOS.md`.
 */
const EN_WORKER: string[] = []

const escenario = (conValorEn1P: readonly string[], enWorker: readonly string[] = EN_WORKER) =>
  cruzar({ declarados: NOMBRES, conValorEn1P, enWorker, soloCi: SOLO_CI, transitorios: TRANSITORIOS })

/**
 * ESTE BLOQUE CAMBIÓ DE SIGNIFICADO el 10-sep-2026, y no se borró.
 *
 * Decía «el Worker no tiene secretos, y eso está bien», que era verdad desde
 * el 6-sep. Ahora hay UNO declarado, `RENDER_RATIO_SECRET`, y el estado
 * correcto ya no es «cero»: es «uno declarado, y hasta que JC lo cree en
 * 1Password y lo suba, `--check` lo dice». Reescribir esto en vez de borrarlo
 * es lo que deja constancia de cuál era el estado anterior y por qué cambió.
 *
 * Ojo a lo que NO cambia: el CI no corre `--check` contra 1Password ni
 * Cloudflare —necesita YubiKey—, sólo estos tests de funciones puras. Así que
 * declarar un secreto que aún no existe no pone el CI en rojo; el rojo lo ve
 * quien corre `--check`, que es justo quien puede arreglarlo.
 */
describe('el estado de hoy: un secreto declarado y todavía sin poner', () => {
  it('con los dos en 1Password y el del Worker puesto, NO se pide acción', () => {
    // El caso al que hay que llegar. Si esto saliera true, el CI viviría en
    // rojo por un Worker que está exactamente como debe estar.
    const c = escenario(['CF_API_TOKEN', 'RENDER_RATIO_SECRET'], ['RENDER_RATIO_SECRET'])
    expect(c.listos).toEqual(['RENDER_RATIO_SECRET', 'CF_API_TOKEN'])
    expect(c).toMatchObject({ faltanEn1P: [], faltanEnWorker: [], sinDeclarar: [], porRetirar: [] })
    expect(pideAccion(c)).toBe(false)
  })

  it('HOY falta en 1Password, y eso SÍ pide acción — con su nombre', () => {
    // El estado real mientras JC no lo cree. No se disimula: un secreto
    // declarado que no existe es exactamente lo que este cruce viene a decir.
    //
    // Y sale por `faltanEn1P`, NO por `faltanEnWorker`: `cruzar` solo cuenta
    // como «falta en el Worker» lo que SÍ tiene valor en 1Password, porque no
    // se puede subir lo que no se tiene. La acción de hoy es crearlo, no
    // subirlo, y el cruce lo dice en ese orden.
    const c = escenario(['CF_API_TOKEN'])
    expect(c.faltanEn1P).toEqual(['RENDER_RATIO_SECRET'])
    expect(c.faltanEnWorker).toEqual([])
    expect(pideAccion(c)).toBe(true)
  })

  it('y con el valor ya en 1Password, la acción pasa a ser SUBIRLO', () => {
    // El segundo paso, para que se vea que el cruce distingue los dos y no
    // dice «falta» de una manera sola.
    const c = escenario(['CF_API_TOKEN', 'RENDER_RATIO_SECRET'])
    expect(c.faltanEn1P).toEqual([])
    expect(c.faltanEnWorker).toEqual(['RENDER_RATIO_SECRET'])
    expect(pideAccion(c)).toBe(true)
  })

  it('ahora SÍ queda algo que subir al Worker, y el de CI sigue fuera', () => {
    expect(DEL_WORKER).toEqual(['RENDER_RATIO_SECRET'])
    // Lo que de verdad decide el camino de subida: el token de CI no entra en
    // el mapa que se le pasa a `wrangler secret bulk`, aunque esté en 1Password.
    const campos = [
      { label: 'CF_API_TOKEN', value: 'x' },
      { label: 'RENDER_RATIO_SECRET', value: 'y' },
    ]
    expect([...valoresDelItem(campos, DEL_WORKER).keys()]).toEqual(['RENDER_RATIO_SECRET'])
    expect(haySincronizables(escenario(['CF_API_TOKEN']))).toBe(true)
  })

  it('y el token de CI sin valor en 1Password también pide acción', () => {
    const c = escenario([])
    expect(c.faltanEn1P).toEqual(['RENDER_RATIO_SECRET', 'CF_API_TOKEN'])
    expect(pideAccion(c)).toBe(true)
  })
})

/**
 * EL TRABAJO QUE LE QUEDA A ESTE SCRIPT. Con el Worker a cero, lo único que
 * puede cambiar por sorpresa es que alguien vuelva a poner un secreto a mano —
 * incluido reponer alguno de los cinco retirados sin leer por qué se quitaron.
 */
describe('lo que vigila ahora: que no reaparezca nada sin declarar', () => {
  it('un secreto puesto a mano en el Worker sale como SIN DECLARAR', () => {
    const c = escenario(['CF_API_TOKEN'], ['SECRETO_QUE_ALGUIEN_PUSO'])
    expect(c.sinDeclarar).toEqual(['SECRETO_QUE_ALGUIEN_PUSO'])
  })

  it('reponer uno de los cinco retirados también se ve', () => {
    // El caso concreto que este repo ya vivió. Aparece por nombre, para que
    // quien lo lea sepa que hay un documento que explica por qué no está.
    const c = escenario(['CF_API_TOKEN'], ['ENCRYPTION_KEY'])
    expect(c.sinDeclarar).toEqual(['ENCRYPTION_KEY'])
  })

  it('pero enseñarlo NO pone el check en rojo POR SÍ SOLO', () => {
    // Si contara, cualquier experimento dejaría el CI en rojo hasta que alguien
    // aprendiera a ignorarlo — y un rojo que se ignora ya no es un control.
    //
    // Se pasa el escenario COMPLETO (los dos declarados en su sitio) para que
    // lo que se mide sea el efecto de lo sin declarar y nada más. Con el
    // escenario a medias, este test pasaría por el motivo equivocado: rojo por
    // el secreto que falta, no por el experimento.
    const c = escenario(
      ['CF_API_TOKEN', 'RENDER_RATIO_SECRET'],
      ['RENDER_RATIO_SECRET', 'EXPERIMENTO'],
    )
    expect(c.sinDeclarar).toEqual(['EXPERIMENTO'])
    expect(pideAccion(c)).toBe(false)
  })
})

describe('el cruce sigue diciendo la verdad en los casos que importan', () => {
  it('un campo VACÍO en 1Password cuenta como que falta, no como que está', () => {
    // `etiquetasConValor` solo devuelve los campos CON valor: un campo creado y
    // sin rellenar es exactamente el caso que este script viene a cazar, y
    // contarlo como presente sería firmar la casilla.
    expect(escenario([]).faltanEn1P).toEqual(['RENDER_RATIO_SECRET', 'CF_API_TOKEN'])
  })

  it('un declarado que NO es de CI y falta en el Worker sí sale como hueco', () => {
    // Hoy no hay ninguno así, pero es la mitad del cruce que se usaría si este
    // Worker volviera a tener secretos. Sin este caso, borrar esa rama no
    // rompería ningún test.
    const c = cruzar({ declarados: ['ALGO'], conValorEn1P: ['ALGO'], enWorker: [] })
    expect(c.faltanEnWorker).toEqual(['ALGO'])
    expect(pideAccion(c)).toBe(true)
  })

  it('un transitorio olvidado en el Worker pide acción; ausente de los dos lados, no', () => {
    const olvidado = cruzar({
      declarados: ['UNO', 'UNO_PREVIOUS'],
      conValorEn1P: ['UNO'],
      enWorker: ['UNO', 'UNO_PREVIOUS'],
      transitorios: ['UNO_PREVIOUS'],
    })
    expect(olvidado.porRetirar).toEqual(['UNO_PREVIOUS'])
    expect(pideAccion(olvidado)).toBe(true)

    const normal = cruzar({
      declarados: ['UNO', 'UNO_PREVIOUS'],
      conValorEn1P: ['UNO'],
      enWorker: ['UNO'],
      transitorios: ['UNO_PREVIOUS'],
    })
    expect(normal.porRetirar).toEqual([])
    expect(pideAccion(normal)).toBe(false)
  })
})

describe('el manifiesto es el contrato, así que se comprueba', () => {
  it('lo declarado para el Worker y lo que el Worker TIENE no coinciden todavía', () => {
    // Y se afirma la diferencia, no se disimula: `RENDER_RATIO_SECRET` está
    // declarado desde el 10-sep y el Worker sigue a cero (medido el 6-sep).
    // El día que JC lo suba, esta lista se actualiza y las dos vuelven a
    // coincidir; mientras, el hueco está escrito con su nombre.
    expect(PERMANENTES.filter((n) => !SOLO_CI.includes(n))).toEqual(['RENDER_RATIO_SECRET'])
    expect(EN_WORKER).toEqual([])
  })

  it('CF_API_TOKEN está declarado pero NO se sube al Worker', () => {
    expect(NOMBRES).toEqual(['RENDER_RATIO_SECRET', 'CF_API_TOKEN'])
    expect(DEL_WORKER).not.toContain('CF_API_TOKEN')
  })

  it('ninguno se declara dos veces, y todos dicen qué son', () => {
    expect(new Set(NOMBRES).size).toBe(NOMBRES.length)
    for (const s of SECRETOS) expect(s.que.length, s.nombre).toBeGreaterThan(30)
  })

  it('los cinco retirados ya NO están declarados', () => {
    // El cambio de este PR, fijado: si alguien los repone en `secretos.ts` sin
    // reponerlos en el Worker, `--check` volvería a decir «faltan en 1P» para
    // siempre — que es justo el rojo permanente que hay que evitar.
    const retirados = [
      'ENCRYPTION_KEY',
      'GITHUB_BRANCH',
      'GITHUB_CLIENT_ID',
      'GITHUB_CLIENT_SECRET',
      'SESSION_SECRET',
    ]
    expect(NOMBRES.filter((n) => retirados.includes(n))).toEqual([])
  })
})

describe('las piezas que tocan a 1Password no devuelven valores de más', () => {
  const campos: CampoOp[] = [
    { label: 'CF_API_TOKEN', value: 'x' },
    { label: 'credential' }, // plantilla de API Credential, vacía
    { label: 'username', value: 'plantilla con valor' },
  ]

  it('etiquetasConValor devuelve NOMBRES, y solo los que tienen valor', () => {
    expect(etiquetasConValor(campos)).toEqual(['CF_API_TOKEN', 'username'])
  })

  it('valoresDelItem se queda solo con los declarados: la plantilla no viaja', () => {
    expect([...valoresDelItem(campos, NOMBRES).keys()]).toEqual(['CF_API_TOKEN'])
  })
})

describe('los diagnósticos que no se ha ganado no se dan', () => {
  it('sin `op` instalado lo dice, y dice cómo instalarlo', () => {
    expect(explicar({ code: 'ENOENT' })).toContain('1password-cli')
  })

  it('un item que no existe NO se anuncia como problema de sesión', () => {
    const msg = explicar({ stderr: '[ERROR] "saastro-theme-prod" isn\'t an item' })
    expect(msg).not.toContain('signin')
    expect(msg).toContain("isn't an item")
  })

  it('dos items con el mismo título se diagnostican como tal', () => {
    // Pasó de verdad el 6-sep mientras se creaba el item.
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
