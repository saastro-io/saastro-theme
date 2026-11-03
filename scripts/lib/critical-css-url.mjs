// @ts-check
/**
 * Modo `--url` de critical-css-check: mide un DESPLIEGUE REAL, sin navegador.
 *
 * El control normal arranca el Worker construido en local; esto pregunta al
 * que está sirviendo de verdad. Existe porque la degradación del CSS crítico en
 * el Worker es silenciosa a propósito (sin binding `ASSETS`, sin plan o ante una
 * excepción la respuesta sale con su `<link>` de siempre), así que lo único que
 * demuestra que producción lo aplica es mirar la respuesta de producción.
 *
 * Por ruta, sobre el HTML que SALE del servidor:
 *   - ninguna hoja `<link rel=stylesheet>` bloqueante en el `<head>`;
 *   - si hay hoja externa, CSS inline suficiente (≥ 200 bytes);
 *   - cada hoja enlazada tiene su plan (`<hoja>.css.plan.json`, 200 JSON), sin el
 *     cual el Worker no puede procesar una ruta SSR.
 * Una redirección, una respuesta que no es HTML o un HTML sin CSS no se miden: se
 * listan como «omitida», con su motivo, para que el silencio no pase por verde.
 *
 * Qué rutas: las sondas SSR que no necesitan configuración (404 en cada idioma,
 * `/p/<slug>` inexistente, `/500`, `/lp/gracias`) + cada URL del sitemap del
 * propio despliegue (reescrita a su origen). Ninguna lista por site.
 */

export const PLAN_SUFFIX = '.plan.json'
const MIN_INLINE = 200

/** Sondas SSR: existen en cualquier descendiente y no requieren configuración. */
export const SONDA_404 = '/__critical-css-check-404'
export const SONDAS = [
  SONDA_404,
  '/es/__critical-css-check-404',
  '/p/__critical-css-check-404',
  '/500',
  '/lp/gracias',
  '/es/lp/gracias',
]

const LINK_HOJA = /<link\b[^>]*\brel=["']?stylesheet[^>]*>/gi

/**
 * @param {string} html
 * @returns {{ enHead: string[], enTotal: string[], inline: number, hrefs: string[] }}
 */
export function analizarHtml(html) {
  const fin = html.search(/<\/head>/i)
  const head = fin < 0 ? html : html.slice(0, fin)
  const enHead = head.match(LINK_HOJA) ?? []
  const enTotal = html.match(LINK_HOJA) ?? []
  const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].reduce((n, m) => n + m[1].length, 0)
  const hrefs = [
    ...new Set(
      enTotal.flatMap((tag) => {
        const h = /\bhref=["']?(\/(?!\/)[^"'\s>]+)/i.exec(tag)?.[1]
        return h ? [h] : []
      }),
    ),
  ]
  return { enHead, enTotal, inline, hrefs }
}

/**
 * Veredicto de una ruta a partir de su HTML. Pura, para poder probarla.
 * @param {string} html
 * @returns {{ fallos: string[], omitida?: string, hojas: number, inline: number }}
 */
export function veredicto(html) {
  const a = analizarHtml(html)
  if (a.enTotal.length === 0 && a.inline === 0) return { fallos: [], omitida: 'HTML sin CSS', hojas: 0, inline: 0 }
  /** @type {string[]} */
  const fallos = []
  if (a.enHead.length) fallos.push(`${a.enHead.length} hoja(s) bloqueante(s) en el <head> (${a.enHead[0]})`)
  if (a.enTotal.length && a.inline < MIN_INLINE) fallos.push(`hay hoja externa pero el CSS inline son ${a.inline} bytes`)
  return { fallos, hojas: a.enTotal.length, inline: a.inline }
}

/** URLs de página del sitemap del despliegue (sigue el índice un nivel). */
async function rutasDelSitemap(/** @type {string} */ origen) {
  /** @type {string[]} */
  const rutas = []
  const loc = (/** @type {string} */ xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1])
  try {
    const r = await fetch(origen + '/sitemap-index.xml')
    if (!r.ok) return rutas
    for (const u of loc(await r.text())) {
      const r2 = await fetch(origen + new URL(u).pathname)
      if (r2.ok) for (const p of loc(await r2.text())) rutas.push(new URL(p).pathname)
    }
  } catch (e) {
    console.warn(`aviso: no pude leer el sitemap de ${origen} (${/** @type {Error} */ (e).message}); solo se miden las sondas`)
  }
  return rutas
}

/**
 * @param {string} urlBase  p. ej. https://theme.saastro.io
 * @param {{ log?: (s: string) => void }} [opts]
 * @returns {Promise<{ filas: {ruta: string, estado: string, resultado: string, detalle: string}[], fallos: number, medidas: number }>}
 */
export async function medirDespliegue(urlBase, opts = {}) {
  const origen = new URL(urlBase).origin
  const rutas = [...new Set([...SONDAS, ...(await rutasDelSitemap(origen))])]
  /** @type {Map<string, Promise<boolean>>} */
  const planes = new Map()
  const hayPlan = (/** @type {string} */ href) => {
    if (!planes.has(href))
      planes.set(
        href,
        fetch(origen + href + PLAN_SUFFIX).then(
          (r) => r.ok && /json/.test(r.headers.get('content-type') ?? ''),
          () => false,
        ),
      )
    return /** @type {Promise<boolean>} */ (planes.get(href))
  }
  const filas = []
  let fallos = 0
  let medidas = 0
  for (const ruta of rutas) {
    const r = await fetch(origen + ruta, { redirect: 'manual', headers: { accept: 'text/html' } })
    const estado = String(r.status)
    if (r.status >= 300 && r.status < 400) {
      await r.arrayBuffer()
      filas.push({ ruta, estado, resultado: 'omitida', detalle: `redirige a ${r.headers.get('location') ?? '?'}` })
      continue
    }
    if (!(r.headers.get('content-type') ?? '').includes('text/html')) {
      await r.arrayBuffer()
      filas.push({ ruta, estado, resultado: 'omitida', detalle: `no es HTML (${r.headers.get('content-type') ?? 'sin tipo'})` })
      continue
    }
    const html = await r.text()
    const v = veredicto(html)
    if (v.omitida) {
      filas.push({ ruta, estado, resultado: 'omitida', detalle: v.omitida })
      continue
    }
    const fa = [...v.fallos]
    for (const href of analizarHtml(html).hrefs) if (!(await hayPlan(href))) fa.push(`sin plan en ${href}${PLAN_SUFFIX}`)
    medidas++
    if (fa.length) fallos++
    filas.push({
      ruta,
      estado,
      resultado: fa.length ? 'FALLA' : 'ok',
      detalle: fa.length ? fa.join('; ') : `0 hojas en el head, ${v.hojas} al final, ${v.inline} B inline`,
    })
    opts.log?.(`${ruta} ${estado} ${fa.length ? 'FALLA' : 'ok'}`)
  }
  // El 404 es el caso que este modo existe para vigilar: si la sonda no devuelve
  // un 404 medido (redirige, 200 catch-all, sin CSS), no se da por bueno.
  const f404 = filas.find((f) => f.ruta === SONDA_404)
  if (!f404 || f404.estado !== '404' || f404.resultado === 'omitida') {
    fallos++
    filas.push({
      ruta: SONDA_404,
      estado: f404?.estado ?? '-',
      resultado: 'FALLA',
      detalle: `la sonda de 404 no se pudo medir como un 404 con CSS (${f404 ? `${f404.estado} ${f404.resultado}: ${f404.detalle}` : 'sin respuesta'}): el caso vigilado queda sin medir`,
    })
  }
  return { filas, fallos, medidas }
}
