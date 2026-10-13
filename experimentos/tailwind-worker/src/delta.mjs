// Núcleo del experimento: extracción de candidatos, topes de seguridad y
// cálculo del CSS delta. Lo usan TAL CUAL el Worker (workerd) y los scripts de
// Node, para que la comparación mida el runtime y no dos implementaciones.

// --- (7) Topes. Los candidatos vienen de contenido de usuario. -------------
export const TOPES = {
  maxBytesEntrada: 256 * 1024, // cuerpo de la petición
  maxCandidatos: 500, // tras deduplicar y quitar los que ya trae el CSS base
  maxLongitudCandidato: 120, // `bg-[url(...)]` razonable cabe; 100 KB no
  maxVariantes: 4, // `a:b:c:d:utilidad`; más es sospechoso
};

// Caracteres que una clase de Tailwind no necesita y que solo sirven para
// romper el CSS generado o el parser: llaves, punto y coma, barra invertida,
// ángulos y comillas invertidas.
const PROHIBIDOS = /[{};\\<>`]/;

/** Extrae candidatos de HTML (atributos class / className). Sin escáner oxide. */
export function extraerCandidatos(texto) {
  const out = new Set();
  const re = /\bclass(?:Name)?\s*=\s*(["'])([\s\S]*?)\1/g;
  let m;
  while ((m = re.exec(texto))) {
    for (const c of m[2].split(/\s+/)) if (c) out.add(c);
  }
  return [...out];
}

/** Aplica los topes. Devuelve { aceptados, rechazados: [{c, motivo}] }. */
export function filtrarCandidatos(candidatos, topes = TOPES) {
  const aceptados = [];
  const rechazados = [];
  for (const c of new Set(candidatos)) {
    if (c.length > topes.maxLongitudCandidato) rechazados.push({ c: c.slice(0, 40) + '…', motivo: 'longitud' });
    else if (PROHIBIDOS.test(c) || !/^[!-~]+$/.test(c)) rechazados.push({ c, motivo: 'caracteres' });
    else if (variantes(c) > topes.maxVariantes) rechazados.push({ c, motivo: 'variantes' });
    // `[prop:valor]` deja escribir CUALQUIER declaración CSS, y `url(` hace
    // que el navegador del visitante pida a un host que elige el autor.
    else if (/(^|:)!?\[/.test(c)) rechazados.push({ c, motivo: 'propiedad-arbitraria' });
    else if (/url\(/i.test(c)) rechazados.push({ c, motivo: 'url' });
    else aceptados.push(c);
  }
  return { aceptados, rechazados };
}

// Cuenta los `:` de primer nivel (fuera de corchetes/paréntesis) = variantes.
function variantes(c) {
  let prof = 0;
  let n = 0;
  for (const ch of c) {
    if (ch === '[' || ch === '(') prof++;
    else if (ch === ']' || ch === ')') prof--;
    else if (ch === ':' && prof === 0) n++;
  }
  return n;
}

// --- Parser CSS mínimo (árbol de bloques) ------------------------------------
// Suficiente para la salida sin minificar de Tailwind: bloques anidados,
// declaraciones, sentencias `@x ...;`, comentarios y cadenas.
export function parseCss(css) {
  let i = 0;
  const n = css.length;
  function bloque() {
    const hijos = [];
    let buf = '';
    while (i < n) {
      const ch = css[i];
      if (ch === '/' && css[i + 1] === '*') {
        const fin = css.indexOf('*/', i + 2);
        i = fin < 0 ? n : fin + 2;
        continue;
      }
      // Escapes de selector (`.content-\[\'\'\]`, `\{`): no abren cadena ni bloque.
      if (ch === '\\') {
        buf += css.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'") {
        let j = i + 1;
        while (j < n && css[j] !== ch) j += css[j] === '\\' ? 2 : 1;
        buf += css.slice(i, j + 1);
        i = j + 1;
        continue;
      }
      if (ch === '{') {
        i++;
        const prelude = norm(buf);
        buf = '';
        hijos.push({ tipo: 'bloque', prelude, hijos: bloque() });
        continue;
      }
      if (ch === '}') {
        i++;
        if (norm(buf)) hijos.push({ tipo: 'decl', texto: norm(buf) });
        return hijos;
      }
      if (ch === ';') {
        i++;
        if (norm(buf)) hijos.push({ tipo: 'decl', texto: norm(buf) });
        buf = '';
        continue;
      }
      buf += ch;
      i++;
    }
    if (norm(buf)) hijos.push({ tipo: 'decl', texto: norm(buf) });
    return hijos;
  }
  return bloque();
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

export function serializar(nodos, ind = '') {
  let s = '';
  for (const nd of nodos) {
    if (nd.tipo === 'decl') s += `${ind}${nd.texto};\n`;
    else s += `${ind}${nd.prelude} {\n${serializar(nd.hijos, ind + '  ')}${ind}}\n`;
  }
  return s;
}

/**
 * Lo que `completo` tiene y `base` no: bloque a bloque por prelude (selector o
 * at-rule) y declaración a declaración. Así un `:root, :host` del layer theme
 * aporta solo las variables nuevas, y un `@property` ya servido no se repite.
 */
export function restarArbol(completo, base) {
  const out = [];
  const declsBase = new Set(base.filter((x) => x.tipo === 'decl').map((x) => x.texto));
  // Un prelude puede repetirse (varios `@font-face`): se busca primero un
  // bloque idéntico; si no lo hay, se baja a nivel de hijos.
  const bloquesBase = new Map();
  for (const b of base) {
    if (b.tipo !== 'bloque') continue;
    if (!bloquesBase.has(b.prelude)) bloquesBase.set(b.prelude, []);
    bloquesBase.get(b.prelude).push(b);
  }
  for (const nd of completo) {
    if (nd.tipo === 'decl') {
      // `@layer utilities;` (capa vacía) no aporta nada si la base ya la abre.
      const capaYaAbierta = nd.texto.startsWith('@layer ') && bloquesBase.has(nd.texto);
      if (!declsBase.has(nd.texto) && !capaYaAbierta) out.push(nd);
      continue;
    }
    const candidatos = bloquesBase.get(nd.prelude) ?? [];
    const texto = serializar([nd]);
    if (candidatos.some((b) => serializar([b]) === texto)) continue;
    if (!candidatos.length) {
      out.push(nd);
      continue;
    }
    // Varios bloques con el mismo prelude (el theme abre su propio
    // `@layer utilities` además del de Tailwind): se comparan sus hijos juntos.
    const hijos = restarArbol(nd.hijos, candidatos.flatMap((b) => b.hijos));
    if (hijos.length) out.push({ ...nd, hijos });
  }
  return out;
}

// --- (6) Manifiesto de clases del CSS base -----------------------------------
// Toda clase que aparece en un selector del CSS servido. Se calcula una vez en
// el build/publicación y viaja como lista; el Worker solo hace `Set.has`.
export function manifiestoDeClases(css) {
  const clases = new Set();
  const re = /\.((?:\\.|[A-Za-z0-9_-])+)/g;
  for (const nd of recorrerPreludes(parseCss(css))) {
    if (nd.startsWith('@')) continue;
    let m;
    while ((m = re.exec(nd))) clases.add(desescapar(m[1]));
  }
  return clases;
}

function* recorrerPreludes(nodos) {
  for (const nd of nodos) {
    if (nd.tipo !== 'bloque') continue;
    yield nd.prelude;
    yield* recorrerPreludes(nd.hijos);
  }
}

// `\:` → `:`, `\[` → `[`, `\31 0` (escape hex con espacio) → `1` …
function desescapar(s) {
  return s.replace(/\\([0-9a-fA-F]{1,6}) ?|\\(.)/g, (_, hex, ch) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : ch,
  );
}

/**
 * El delta completo. `compilar` es una función async que devuelve un compilador
 * de Tailwind recién hecho (la pone quien llama: el Worker o Node).
 */
export async function calcularDelta({ compilar, candidatos, manifiesto, arbolBase, reloj = () => 0 }) {
  const t0 = reloj();
  const faltan = candidatos.filter((c) => !manifiesto.has(c));
  const compilador = await compilar();
  const t1 = reloj();
  const completo = compilador.build(faltan);
  const t2 = reloj();
  const delta = serializar(restarArbol(parseCss(completo), arbolBase));
  const t3 = reloj();
  return {
    faltan,
    delta,
    ms: { compile: t1 - t0, build: t2 - t1, resta: t3 - t2, total: t3 - t0 },
  };
}
