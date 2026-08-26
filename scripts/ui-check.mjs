#!/usr/bin/env node
/**
 * ui:check — compara los primitivos locales contra el registry de saastro-ui.
 *
 * Los primitivos NO son un paquete npm y no lo serán nunca: Tailwind no escanea
 * node_modules, así que las clases de dentro del paquete no entran en el CSS
 * generado. Se distribuyen copy-in con el CLI de shadcn, y el precio del
 * copy-in es el drift silencioso: alguien corrige `select.tsx` en el registry y
 * este repo se queda con la versión vieja sin que nada avise.
 *
 * Esto es lo que avisa. Solo LEE: no escribe, no sobreescribe, no pide nada.
 * Para traer los cambios, `pnpm ui:sync`, que deja el diff sin commitear para
 * que lo revises — en copy-in, el diff ES la revisión.
 *
 * Uso:
 *   pnpm ui:check                 # todos
 *   pnpm ui:check select button   # solo esos
 *   pnpm ui:check --diff          # además, el diff unificado de cada uno
 *   REGISTRY=http://localhost:4321/r pnpm ui:check   # contra un ui-docs local
 *
 * Salidas: 0 si todo al día o solo faltan locales que el registry no tiene;
 * 1 si algún primitivo compartido difiere (para poder engancharlo a CI).
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REGISTRY = process.env.REGISTRY ?? 'https://ui.saastro.io/r'
const UI_DIR = resolve(process.cwd(), 'src/components/ui')
const args = process.argv.slice(2)
const WANT_DIFF = args.includes('--diff')
const only = args.filter((a) => !a.startsWith('--'))

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
}

if (!existsSync(UI_DIR)) {
  console.error(`No existe ${UI_DIR}. ¿Estás en la raíz del repo?`)
  process.exit(1)
}

const locales = readdirSync(UI_DIR)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => f.replace(/\.tsx$/, ''))
  .filter((n) => (only.length ? only.includes(n) : true))

if (!locales.length) {
  console.error(only.length ? `Ninguno de esos primitivos existe aquí.` : 'No hay primitivos.')
  process.exit(1)
}

/** El JSON del registry ya trae el contenido del fichero: basta con leerlo. */
async function fromRegistry(name) {
  const res = await fetch(`${REGISTRY}/${name}.json`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  const json = await res.json()
  const file = (json.files ?? []).find((f) => f.path?.endsWith(`${name}.tsx`)) ?? json.files?.[0]
  return file?.content ?? null
}

/** Diff unificado mínimo, por líneas. Sin dependencias. */
function unified(a, b, name) {
  const A = a.split('\n')
  const B = b.split('\n')
  const out = []
  const max = Math.max(A.length, B.length)
  for (let i = 0; i < max; i++) {
    if (A[i] === B[i]) continue
    if (A[i] !== undefined) out.push(C.red(`  - ${A[i]}`))
    if (B[i] !== undefined) out.push(C.green(`  + ${B[i]}`))
  }
  return out.length ? [C.dim(`  ── ${name}: local(-) vs registry(+)`), ...out].join('\n') : ''
}

const iguales = []
const distintos = []
const soloLocal = []
const fallos = []

for (const name of locales) {
  const local = readFileSync(join(UI_DIR, `${name}.tsx`), 'utf8')
  let remoto
  try {
    remoto = await fromRegistry(name)
  } catch (e) {
    fallos.push([name, e.message])
    continue
  }
  if (remoto == null) {
    soloLocal.push(name)
  } else if (remoto.trim() === local.trim()) {
    iguales.push(name)
  } else {
    distintos.push([name, local, remoto])
  }
}

console.log(`\n${C.bold('ui:check')} ${C.dim(`— ${locales.length} primitivos locales contra ${REGISTRY}`)}\n`)

if (iguales.length) console.log(`${C.green('✓ al día')}      ${iguales.join(' ')}`)

if (soloLocal.length) {
  console.log(
    `${C.dim('· solo local')}   ${soloLocal.join(' ')}\n` +
      C.dim('                (no están en el registry — candidatos a subirlos allí)'),
  )
}

if (distintos.length) {
  console.log(`${C.yellow('⚠ difieren')}    ${distintos.map(([n]) => n).join(' ')}`)
  if (WANT_DIFF) {
    console.log()
    for (const [n, local, remoto] of distintos) console.log(unified(local, remoto, n) + '\n')
  } else {
    console.log(C.dim('                `pnpm ui:check --diff` para ver qué cambia'))
  }
}

if (fallos.length) {
  console.log(`${C.red('✗ error')}`)
  for (const [n, m] of fallos) console.log(`  ${n}: ${m}`)
}

console.log()
if (distintos.length) {
  console.log(
    C.dim(`Trae los cambios con \`pnpm ui:sync\` y revísalos con \`git diff\`.\n` +
      `Si la versión buena es la de aquí, súbela al registry en saastro-ui.\n`),
  )
}

process.exit(distintos.length || fallos.length ? 1 : 0)
