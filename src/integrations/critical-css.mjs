// @ts-check
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Beasties from "beasties";

/**
 * CSS crítico inline + resto del CSS fuera del camino crítico.
 *
 * Tras el build recorre el HTML prerenderizado (`dist/client`), deja inline SOLO
 * las reglas que esa página usa y mueve el `<link rel=stylesheet>` (el CSS
 * completo, cacheable y compartido entre páginas) al final del `<body>`. Sin JS,
 * sin `onload`, sin cambios de CSP.
 *
 * Las rutas SSR (`prerender = false`) no pasan por aquí: siguen como las deja Astro.
 *
 * @param {{ preload?: 'body' | 'swap' | 'media' | 'media-script' }} [opts]
 * @returns {import('astro').AstroIntegration}
 */
export default function criticalCss(opts = {}) {
  return {
    name: "saastro-critical-css",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        /** @type {Set<string>} */
        const unevaluable = new Set();
        const beasties = new Beasties({
          path: root,
          publicPath: "/",
          preload: opts.preload ?? "body",
          pruneSource: false,
          // Lo que el análisis estático del HTML NO puede ver y decide el primer pintado:
          //  - estado que un script del <head> pone en <html> antes de pintar (`dark`
          //    de ApplyColorMode; sin él el CSS crítico pinta el tema CLARO y salta);
          //  - reglas ancladas a :root/html/body (tokens, fuente base);
          //  - `:has()`, que Beasties no sabe evaluar y descarta en silencio
          //    (p. ej. `:root:has(.ds-home)`, que fija los tokens de la home).
          allowRules: [
            /^\.dark(?![\w-])/,
            /^(:root|html|body)(?![\w-])/,
            /^\[data-(theme|mode)/,
            /:has\(/,
          ],
          logLevel: "debug",
          logger: {
            trace() {},
            info() {},
            debug(m) {
              if (m.startsWith("Cannot statically evaluate"))
                unevaluable.add(m.split(": ")[1]?.split(" (")[0] ?? m);
            },
            warn: (m) => logger.warn(m),
            error: (m) => logger.error(m),
          },
        });
        /** @param {string} d @returns {Promise<string[]>} */
        const walk = async (d) => {
          const out = [];
          for (const e of await readdir(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) out.push(...(await walk(p)));
            else if (e.name.endsWith(".html")) out.push(p);
          }
          return out;
        };
        let n = 0;
        for (const f of await walk(root)) {
          const html = await readFile(f, "utf8");
          if (!/<link[^>]+rel=["']?stylesheet/i.test(html)) continue;
          let out = await beasties.process(html);
          // `@font-face`: Beasties solo los deja en el crítico si ve el nombre de la
          // familia en un `font-family`, y aquí llega por `var(--font-body)`. Sin
          // ellos la fuente no se pide hasta que llega el CSS completo (swap tardío).
          // Son pocas líneas y el navegador solo baja los subsets (`unicode-range`)
          // que el texto usa, así que se inlinan todos.
          const faces = new Set();
          for (const m of html.matchAll(
            /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi,
          )) {
            if (!m[1].startsWith("/")) continue;
            try {
              const css = await readFile(path.join(root, m[1]), "utf8");
              for (const ff of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
                if (!/url\(\s*["']?data:/.test(ff)) faces.add(ff); // base64 ya viaja en el CSS: no se duplica
              }
            } catch {}
          }
          if (faces.size)
            out = out.replace(
              "</head>",
              `<style>${[...faces].join("")}</style></head>`,
            );
          await writeFile(f, out);
          n++;
        }
        logger.info(`CSS crítico inline en ${n} páginas`);
        if (unevaluable.size) {
          logger.warn(
            `${unevaluable.size} selectores que Beasties no sabe evaluar y quedan fuera del crítico ` +
              `(se aplican al llegar el CSS completo): ${[...unevaluable].slice(0, 5).join(" | ")}`,
          );
        }
      },
    },
  };
}
