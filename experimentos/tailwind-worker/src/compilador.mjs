// compile() de Tailwind 4 sin sistema de ficheros (2): cada @import y cada
// @plugin se sirven desde lo empaquetado. Lo que no esté aquí falla con nombre.
import typography from '@tailwindcss/typography';
import { compile } from 'tailwindcss';
import { STYLESHEETS, THEME_CSS } from './assets.generated.mjs';

export const cargas = { hojas: [], modulos: [] };

export function compilar(css = THEME_CSS) {
  return compile(css, {
    base: '/',
    async loadStylesheet(id, base) {
      cargas.hojas.push(id);
      const content = STYLESHEETS[id];
      if (content == null) throw new Error(`loadStylesheet: hoja no empaquetada: ${id}`);
      return { path: id, base, content };
    },
    async loadModule(id, base, hint) {
      cargas.modulos.push(id);
      if (id === '@tailwindcss/typography') return { path: id, base, module: typography };
      throw new Error(`loadModule: módulo no empaquetado: ${id} (${hint})`);
    },
  });
}
