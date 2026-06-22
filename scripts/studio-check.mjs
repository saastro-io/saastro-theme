#!/usr/bin/env node
/**
 * studio:check — the pre-push validation gate for a Studio-instrumented site.
 *
 * Runs the SAME validator the Hub Setup doctor runs (`@saastro/studio/doctor`,
 * shared from @saastro/studio-core) so "green here ⇒ green Connect in the Hub".
 * No drift: one parser.
 *
 * Checks (gate items 1/2/4/5/7; item 6 = `astro build` is chained in the npm
 * script; item 3 "registered in config" is intentionally omitted — section keys
 * are per-project examples, not a closed canon):
 *   - missing data-saastro markers / non-instrumented sections (analyzeSections)
 *   - i18n EN/ES parity, hardcoded hex, raw <form>, allowlist (runDoctorChecks)
 *
 * Pure read-only. Exits 1 if anything needs attention.
 *
 * Local dev against an UNPUBLISHED @saastro/studio build: point DOCTOR_MODULE at
 * the local dist, e.g.
 *   DOCTOR_MODULE=../saastro-hub/packages/studio/dist/doctor.js node scripts/studio-check.mjs
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const I18N_DIR = join(SRC, 'i18n', 'translations')
const DEFAULT_LOCALE = 'en'

// ── load the shared doctor (published package, or a local build override) ─────
const doctorSpecifier = process.env.DOCTOR_MODULE
  ? resolve(ROOT, process.env.DOCTOR_MODULE)
  : '@saastro/studio/doctor'
let doctor
try {
  doctor = await import(doctorSpecifier)
} catch (err) {
  console.error(
    `\n✖ studio:check could not load the doctor from "${doctorSpecifier}".\n` +
      `  Needs @saastro/studio >= 0.7.0 (the /doctor subpath). Run: pnpm add -D @saastro/studio@latest\n` +
      `  (${err?.message ?? err})\n`,
  )
  process.exit(1)
}
const { analyzeSections, detectAutoWrapPagesInConfig, runDoctorChecks } = doctor

// ── collect inputs ────────────────────────────────────────────────────────────
function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(astro|tsx|jsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

const files = walk(SRC).map(abs => ({
  path: relative(ROOT, abs),
  content: readFileSync(abs, 'utf8'),
}))

// locales: every <locale>.json under the translations dir (filename = locale)
const localeFiles = existsSync(I18N_DIR)
  ? readdirSync(I18N_DIR).filter(f => f.endsWith('.json'))
  : []
const locales = localeFiles.map(f => ({
  locale: f.replace(/\.json$/, ''),
  file: relative(ROOT, join(I18N_DIR, f)),
  data: JSON.parse(readFileSync(join(I18N_DIR, f), 'utf8')),
}))
const defaultLocale =
  locales.find(l => l.locale === DEFAULT_LOCALE) ?? locales[0] ?? { data: {} }
const i18nKeys = new Set(Object.keys(defaultLocale.data ?? {}))

// astro.config flag state (mirrors what the @saastro/studio plugin actually stamps)
let autoWrapPages = false
for (const name of ['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.mts']) {
  const p = join(ROOT, name)
  if (existsSync(p) && statSync(p).isFile()) {
    autoWrapPages = detectAutoWrapPagesInConfig(readFileSync(p, 'utf8'))
    break
  }
}

// ── run the shared validators ──────────────────────────────────────────────────
const report = analyzeSections(files, i18nKeys, autoWrapPages)
const checks = runDoctorChecks({ files, locales })

// ── report ──────────────────────────────────────────────────────────────────
const ATTENTION = new Set(['no_schema_no_i18n', 'missing_marker', 'autowrap_gap'])
const sectionIssues = report.sections.filter(s => ATTENTION.has(s.status))
const errorFindings = checks.findings.filter(f => f.severity === 'error')
const warnFindings = checks.findings.filter(f => f.severity === 'warn')

const fmt = n => String(n)
console.log(
  `studio:check — ${files.length} files, ${locales.length} locales, ` +
    `autoWrapPages=${fmt(autoWrapPages)}`,
)
console.log(
  `  sections: ${report.stats.editable} editable, ${report.stats.needsAttention} need attention`,
)

for (const s of sectionIssues) {
  console.log(`  ✖ [${s.status}] ${s.file} (${s.sectionPrefix}) — ${s.reason}`)
  if (s.snippet) console.log(`      fix: ${s.snippet}`)
}
for (const f of errorFindings) {
  console.log(`  ✖ [${f.status}] ${f.file} — ${f.reason}`)
}
for (const f of warnFindings) {
  console.log(`  ⚠ [${f.status}] ${f.file} — ${f.reason}`)
}

const failures = report.stats.needsAttention + checks.stats.needsAttention
if (failures > 0) {
  console.error(`\n✖ studio:check failed — ${failures} blocking issue(s).`)
  process.exit(1)
}
console.log(
  `\n✓ studio:check passed${warnFindings.length ? ` (${warnFindings.length} warning(s))` : ''}.`,
)
