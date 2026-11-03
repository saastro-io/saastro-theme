// @ts-check
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { compileSheet, encodePlan } from "beasties/compiler";
import { createProcessor } from "beasties/runtime";
import { ALLOW_RULES, PLAN_SUFFIX, PROCESSOR_OPTIONS } from "./critical-css-config.mjs";

/**
 * El motor decide qué `@font-face` inlinar mirando los `font-family` de las reglas
 * críticas. Aquí la familia llega por un token (`--font-body: "Geist Variable"`,
 * y `font-family: var(--font-body)` en el uso), así que no la vería y la fuente
 * no se pediría hasta que llegase el CSS completo. Cada custom property cuyo nombre
 * contiene «font» cuenta como declaración de familia de su regla.
 *
 * @param {import('beasties/compiler').CompiledSheet} sheet
 */
function declareFontsFromTokens(sheet) {
  for (const rule of sheet.rules) {
    const text = rule.body ?? rule.css ?? "";
    /** @type {string[]} */
    const families = [];
    for (const m of text.matchAll(/--[\w-]*font[\w-]*:([^;}]+)/gi)) {
      for (const part of m[1].split(",")) {
        const fam = part.trim().replace(/^["']|["']$/g, "");
        if (fam && !fam.startsWith("var(")) families.push(fam);
      }
    }
    if (families.length) rule.fontsUsed = [...(rule.fontsUsed ?? []), ...families];
  }
}

/** ¿Alguna regla de ALLOW_RULES deja pasar este selector? */
const cubierto = (/** @type {string} */ sel) =>
  ALLOW_RULES.some((r) => (r instanceof RegExp ? r.test(sel) : r === sel));

/** ¿Este selector usa la sonda (`.clase` o `[data-x]`) como parte propia? */
function usa(/** @type {string} */ sel, /** @type {string} */ sonda) {
  const esc = sonda.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(esc + "(?![\\w-])").test(sel);
}

/**
 * Estado que un script INLINE del `<head>` pone en `<html>` antes de pintar:
 * `documentElement.classList.add|toggle|replace('x')` → `.x`, y
 * `documentElement.setAttribute('data-x', …)` / `.dataset.x = …` → `[data-x]`.
 * El HTML estático no lo trae, así que el análisis no lo ve (ver ALLOW_RULES).
 *
 * @param {string} html
 * @returns {Set<string>}
 */
function estadosPrevios(html) {
  const out = new Set();
  const head = html.slice(0, Math.max(0, html.search(/<\/head>/i)));
  for (const m of head.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    const js = m[1];
    for (const c of js.matchAll(/documentElement\.classList\.(?:add|toggle|replace)\(\s*(['"])([\w-]+)\1/g)) out.add("." + c[2]);
    for (const c of js.matchAll(/documentElement\.setAttribute\(\s*(['"])(data-[\w-]+)\1/g)) out.add(`[${c[2]}`);
    for (const c of js.matchAll(/documentElement\.dataset\.([a-zA-Z]\w*)/g))
      out.add("[data-" + c[1].replace(/[A-Z]/g, (u) => "-" + u.toLowerCase()));
  }
  return out;
}

/**
 * CSS crítico inline + resto del CSS fuera del camino bloqueante.
 *
 * Dos mitades, un solo motor (`beasties/runtime`):
 *
 *  1. BUILD (`astro:build:done`): compila cada hoja de `dist/client` en un
 *     «plan» (`<hoja>.css.plan.json`, un asset más) y procesa con él el HTML
 *     prerenderizado: deja inline SOLO las reglas que esa página usa y mueve el
 *     `<link rel=stylesheet>` al final del `<body>`.
 *  2. WORKER (`critical-css-middleware.ts`): hace lo mismo con las rutas SSR
 *     (`/lp/*`, `/p/<slug>`, 404…), que no pasan por el build, leyendo los
 *     planes de los assets. Los nombres con hash no hacen falta en build: salen
 *     del propio HTML de cada respuesta.
 *
 * Sin JS, sin `onload`, sin cambios de CSP. Sin listas de rutas ni umbrales.
 *
 * @returns {import('astro').AstroIntegration}
 */
export default function criticalCss() {
  return {
    name: "saastro-critical-css",
    hooks: {
      "astro:config:setup": ({ addMiddleware }) => {
        addMiddleware({
          entrypoint: fileURLToPath(new URL("./critical-css-middleware.ts", import.meta.url)),
          // 'post': el más cercano a la página, ve su HTML tal cual sale y las
          // cabeceras de seguridad se ponen por fuera.
          order: "post",
        });
      },
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        /** @param {string} d @param {string} ext @returns {Promise<string[]>} */
        const walk = async (d, ext) => {
          /** @type {string[]} */
          const out = [];
          for (const e of await readdir(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) out.push(...(await walk(p, ext)));
            else if (e.name.endsWith(ext)) out.push(p);
          }
          return out;
        };

        // 1. Un plan por hoja.
        const plans = [];
        /** @type {import('beasties/compiler').CompiledSheet[]} */
        const sheets = [];
        /** @type {Map<string, string[]>} selector → hojas donde no se supo evaluar */
        const unevaluable = new Map();
        for (const f of await walk(root, ".css")) {
          const href = "/" + path.relative(root, f).split(path.sep).join("/");
          const sheet = compileSheet(await readFile(f, "utf8"), { href, allowRules: ALLOW_RULES });
          declareFontsFromTokens(sheet);
          sheets.push(sheet);
          for (const w of sheet.warnings) {
            const sel = w.split(": ")[1]?.split(" (")[0] ?? w;
            unevaluable.set(sel, [...(unevaluable.get(sel) ?? []), href]);
          }
          const plan = encodePlan(sheet);
          await writeFile(f + PLAN_SUFFIX, JSON.stringify(plan));
          plans.push(plan);
        }

        // 2. El HTML prerenderizado.
        const processor = createProcessor(plans, PROCESSOR_OPTIONS);
        let n = 0;
        /** @type {Set<string>} */
        const estados = new Set();
        for (const f of await walk(root, ".html")) {
          const html = await readFile(f, "utf8");
          if (!/<link[^>]+rel=["']?stylesheet/i.test(html)) continue;
          for (const e of estadosPrevios(html)) estados.add(e);
          await writeFile(f, processor.process(html));
          n++;
        }
        logger.info(`CSS crítico inline en ${n} páginas (${plans.length} planes en dist/client)`);
        for (const sonda of estados) {
          if (cubierto(sonda)) continue;
          const usados = sheets.flatMap((sh) =>
            sh.rules.flatMap((r) => (r.selectors ?? []).filter((sel) => usa(sel, sonda) && !cubierto(sel))),
          );
          if (usados.length)
            logger.warn(
              `un script del <head> pone «${sonda}» en <html> y ${usados.length} selectores del CSS lo usan ` +
                `sin estar en ALLOW_RULES (p. ej. «${usados[0]}»): la página pinta sin esas reglas hasta que ` +
                `llega el CSS completo. Añade su selector a ALLOW_RULES en ` +
                `src/integrations/critical-css-config.mjs (docs/css-critico.md).`,
            );
        }
        if (unevaluable.size) {
          logger.warn(
            `${unevaluable.size} selectores que no sé evaluar quedan fuera del crítico y se aplican al llegar ` +
              `el CSS completo: ${[...unevaluable.keys()].slice(0, 5).join(" | ")}. ` +
              `Si deciden el primer pintado (estado de <html> que pone un script del <head>), añádelos a ` +
              `ALLOW_RULES en src/integrations/critical-css-config.mjs (docs/css-critico.md).`,
          );
        }
      },
    },
  };
}
