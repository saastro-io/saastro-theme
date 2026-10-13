// (2) Qué pasa si global.css pide una hoja o un plugin que no está empaquetado.
import { writeFileSync } from 'node:fs';
import { compilar } from '../src/compilador.mjs';
const casos = ['@import "tailwindcss";\n@import "no-empaquetado.css";', '@import "tailwindcss";\n@plugin "@tailwindcss/forms";'];
const out = [];
for (const css of casos) {
  try {
    await compilar(css);
    out.push('compiló');
  } catch (e) {
    out.push(e.message);
  }
}
console.log(out.join('\n'));
writeFileSync(new URL('../resultados/import-no-empaquetado.txt', import.meta.url), out.join('\n') + '\n');
