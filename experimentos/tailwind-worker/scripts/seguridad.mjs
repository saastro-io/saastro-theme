// (7) Entradas hostiles. Parte A: build() SIN topes en workerd (POST /crudo).
// Parte B: las mismas entradas por /delta, CON topes. Parte C (Node): @apply
// recursivo en el CSS del theme. Mide ms dentro del Worker, pared, y RSS de workerd.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { compilar } from '../src/compilador.mjs';

const W = process.env.WORKER ?? 'http://localhost:8799';
const rss = () => execSync('pgrep -x workerd || true').toString().trim().split('\n').filter(Boolean)
  .reduce((t, pid) => t + Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1] ?? 0), 0) / 1024;

const casos = {
  'valor arbitrario de 100 KB': [`bg-[${'a'.repeat(100_000)}]`],
  'valor arbitrario de 1 MB': [`w-[${'1'.repeat(1_000_000)}px]`],
  'calc anidado 2000 niveles': [`w-[${'calc('.repeat(2000)}1px${')'.repeat(2000)}]`],
  '1000 variantes apiladas': [`${'hover:'.repeat(1000)}p-4`],
  '10 000 candidatos distintos': Array.from({ length: 10_000 }, (_, i) => `p-[${i}px]`),
  '50 000 candidatos distintos': Array.from({ length: 50_000 }, (_, i) => `m-[${i}px]`),
  'inyección con llaves': ['bg-[red;}body{display:none]', 'bg-[red}*{color:red]'],
  'propiedad arbitraria con url externa': ['[background-image:url(https://ejemplo.invalid/p.png)]'],
  'valor arbitrario con url externa': ['bg-[url(https://ejemplo.invalid/p.png)]'],
  'variante arbitraria': ['[&_p]:mt-[7px]'],
  'cinco variantes cortas': ['sm:md:lg:hover:focus:p-[7px]'],
};

const res = {};
for (const [nombre, candidatos] of Object.entries(casos)) {
  const r0 = rss();
  const t0 = performance.now();
  let crudo;
  try {
    const r = await fetch(`${W}/crudo`, { method: 'POST', body: JSON.stringify({ candidatos }) });
    crudo = r.headers.get('content-type')?.includes('json') ? await r.json() : { status: r.status, texto: (await r.text()).slice(0, 200) };
  } catch (e) {
    crudo = { error: String(e) };
  }
  const pared = performance.now() - t0;
  const html = `<div class="${candidatos.join(' ')}"></div>`;
  const t1 = performance.now();
  const r2 = await fetch(`${W}/delta`, { method: 'POST', body: JSON.stringify({ html }) });
  const conTopes = await r2.json();
  res[nombre] = {
    sinTopes: { msBuildDentroWorker: crudo.msBuild, paredMs: Math.round(pared), bytesSalida: crudo.bytesSalida, muestra: crudo.muestra?.slice(0, 220), error: crudo.error, status: crudo.status, rssWorkerdMB: { antes: Math.round(r0), despues: Math.round(rss()) } },
    conTopes: { status: r2.status, paredMs: Math.round(performance.now() - t1), error: conTopes.error, rechazados: conTopes.rechazados?.length, motivos: [...new Set(conTopes.rechazados?.map((x) => x.motivo) ?? [])], faltan: conTopes.faltan?.length, deltaBytes: conTopes.delta?.length },
  };
  console.log(nombre, JSON.stringify(res[nombre]));
}

// C. @apply recursivo: solo puede venir del CSS del theme (el contenido aporta
// candidatos, no CSS). ¿compile() lo corta o se cuelga?
try {
  const t0 = performance.now();
  await compilar(`@import 'tailwindcss';\n@utility foo { @apply bar; }\n@utility bar { @apply foo; }`).then((c) => c.build(['foo']));
  res['@apply recursivo (theme)'] = { resultado: 'compiló', ms: performance.now() - t0 };
} catch (e) {
  res['@apply recursivo (theme)'] = { resultado: 'error', mensaje: String(e.message).slice(0, 200) };
}
console.log('@apply recursivo (theme)', JSON.stringify(res['@apply recursivo (theme)']));
writeFileSync(new URL('../resultados/seguridad.json', import.meta.url), JSON.stringify(res, null, 2));
