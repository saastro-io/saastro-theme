#!/usr/bin/env node
/**
 * ui:sync — trae los primitivos desde el registry de saastro-ui.
 *
 * Escribe los ficheros y NO commitea nada, a propósito: en el modelo copy-in el
 * `git diff` ES la revisión. Un `--overwrite` a ciegas te borra los ajustes
 * locales en silencio, que es lo que da mala fama a este modelo.
 *
 * Por eso, además:
 *   - avisa antes si el working tree tiene cambios sin commitear en
 *     src/components/ui (así el diff que veas después es solo el de la sync);
 *   - por defecto solo toca los que DIFIEREN, no reescribe los que ya están al día;
 *   - lista al final qué cambió, para que sepas dónde mirar.
 *
 * Uso:
 *   pnpm ui:sync                  # todos los que difieran
 *   pnpm ui:sync select button    # solo esos
 *   pnpm ui:sync --dry            # di qué harías, sin escribir
 *   REGISTRY=http://localhost:4321/r pnpm ui:sync   # contra un ui-docs local
 *
 * Escribir en el registry es al revés: si la versión buena es la de aquí, se
 * sube a saastro-ui. Este script nunca empuja hacia allá.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const REGISTRY = process.env.REGISTRY ?? 'https://ui.saastro.io/r'
const UI_DIR = resolve(process.cwd(), 'src/components/ui')
const args = process.argv.slice(2)
const DRY = args.includes('--dry')
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

// Aviso, no bloqueo: quien sabe lo que hace puede seguir.
if (!DRY) {
  try {
    const sucio = execFileSync('git', ['status', '--porcelain', '--', 'src/components/ui'], {
      encoding: 'utf8',
    }).trim()
    if (sucio) {
      console.log(
        `\n${C.yellow('⚠')} Hay cambios sin commitear en src/components/ui:\n` +
          sucio.split('\n').map((l) => `    ${l}`).join('\n') +
          C.dim(`\n\n  El diff de después mezclará los tuyos con los de la sync.\n`) +
          C.dim(`  Commitea o guarda antes si quieres verlos separados.\n`),
      )
    }
  } catch {
    /* sin git: seguimos igual */
  }
}

const locales = readdirSync(UI_DIR)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => f.replace(/\.tsx$/, ''))
  .filter((n) => (only.length ? only.includes(n) : true))

async function fromRegistry(name) {
  const res = await fetch(`${REGISTRY}/${name}.json`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const file = (json.files ?? []).find((f) => f.path?.endsWith(`${name}.tsx`)) ?? json.files?.[0]
  return file?.content ?? null
}

const escritos = []
const alDia = []
const soloLocal = []
const fallos = []

for (const name of locales) {
  const ruta = join(UI_DIR, `${name}.tsx`)
  const local = readFileSync(ruta, 'utf8')
  let remoto
  try {
    remoto = await fromRegistry(name)
  } catch (e) {
    fallos.push([name, e.message])
    continue
  }
  if (remoto == null) soloLocal.push(name)
  else if (remoto.trim() === local.trim()) alDia.push(name)
  else {
    if (!DRY) writeFileSync(ruta, remoto)
    escritos.push(name)
  }
}

console.log(`\n${C.bold('ui:sync')} ${C.dim(`— desde ${REGISTRY}${DRY ? '  (--dry)' : ''}`)}\n`)
if (alDia.length) console.log(`${C.dim('· ya al día')}    ${alDia.join(' ')}`)
if (soloLocal.length) console.log(`${C.dim('· solo local')}   ${soloLocal.join(' ')}`)
if (fallos.length) for (const [n, m] of fallos) console.log(`${C.red('✗')} ${n}: ${m}`)

if (escritos.length) {
  console.log(`${DRY ? C.yellow('→ cambiaría') : C.green('✓ escritos')}   ${escritos.join(' ')}\n`)
  console.log(
    C.dim(
      DRY
        ? 'Quita --dry para escribirlos.\n'
        : 'NADA commiteado. Revísalo con:\n' +
          `    git diff -- src/components/ui\n` +
          'Si algo de lo local era mejor, recupéralo y súbelo al registry en saastro-ui.\n',
    ),
  )
} else {
  console.log(`${C.green('✓')} nada que traer.\n`)
}

process.exit(fallos.length ? 1 : 0)
