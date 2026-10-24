// (4) Tiempos en workerd (wrangler dev) y, como referencia, en Node.
//
// Por cada n ∈ {10, 100, 500}: REPS arranques limpios de `wrangler dev`
// (isolate nuevo → petición en frío) y CALIENTES peticiones más en el mismo
// isolate. De cada petición se apunta:
//   - ms dentro del Worker (performance.now(); en local SÍ avanza con CPU)
//   - ms de pared vistos por el cliente HTTP
//   - ms de CPU del proceso workerd (suma de /proc/<pid>/task/*/schedstat),
//     que es CPU real consumida, no reloj.
import { spawn, execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8799;
const NS = [10, 100, 500];
const REPS = Number(process.env.REPS ?? 5);
const CALIENTES = Number(process.env.CALIENTES ?? 10);

const cpuWorkerdNs = () => {
  let total = 0;
  for (const pid of execSync('pgrep -x workerd || true').toString().trim().split('\n').filter(Boolean)) {
    for (const t of readdirSync(`/proc/${pid}/task`)) {
      try {
        total += Number(readFileSync(`/proc/${pid}/task/${t}/schedstat`, 'utf8').split(' ')[0]);
      } catch {}
    }
  }
  return total;
};

async function arrancar() {
  execSync('pkill -x workerd || true; pkill -f "[w]rangler dev" || true');
  await new Promise((r) => setTimeout(r, 1000));
  const p = spawn('npx', ['wrangler', 'dev', '--port', String(PUERTO)], {
    cwd: aqui,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    stdio: 'ignore',
    detached: true,
  });
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://localhost:${PUERTO}/no-existe`);
      if (r.status === 404) return p;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('wrangler dev no arrancó');
}

async function pedir(n) {
  const c0 = cpuWorkerdNs();
  const t0 = performance.now();
  const r = await fetch(`http://localhost:${PUERTO}/bench?n=${n}`);
  const j = await r.json();
  const pared = performance.now() - t0;
  const cpu = (cpuWorkerdNs() - c0) / 1e6;
  if (j.error) throw new Error(j.error);
  return { frio: j.frio, faltan: j.faltan, deltaBytes: j.deltaBytes, worker: j.ms, paredCliente: pared, cpuWorkerd: cpu };
}

const mediana = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const r1 = (x) => Math.round(x * 10) / 10;

const crudo = [];
const resumen = [];
for (const n of NS) {
  const frios = [];
  const calientes = [];
  for (let rep = 0; rep < REPS; rep++) {
    const p = await arrancar();
    // «Frío» = primera compilación del isolate: el módulo ya está evaluado
    // (arrancar() espera a un 404), pero compile(), el parseo del CSS base y
    // el JIT de Tailwind no han corrido nunca en él.
    frios.push(await pedir(n));
    for (let k = 0; k < CALIENTES; k++) calientes.push(await pedir(n));
    process.kill(-p.pid);
  }
  crudo.push({ n, frios, calientes });
  const fila = (xs, campo) => r1(mediana(xs.map(campo)));
  resumen.push({
    n,
    faltan: frios[0].faltan,
    deltaKB: r1(frios[0].deltaBytes / 1024),
    frio: {
      compileMs: fila(frios, (x) => x.worker.compile),
      buildMs: fila(frios, (x) => x.worker.build),
      parseoMasRestaMs: fila(frios, (x) => x.worker.resta + x.worker.parseBase),
      totalWorkerMs: fila(frios, (x) => x.worker.total + x.worker.parseBase),
      paredClienteMs: fila(frios, (x) => x.paredCliente),
      cpuWorkerdMs: fila(frios, (x) => x.cpuWorkerd),
    },
    caliente: {
      compileMs: fila(calientes, (x) => x.worker.compile),
      buildMs: fila(calientes, (x) => x.worker.build),
      parseoMasRestaMs: fila(calientes, (x) => x.worker.resta + x.worker.parseBase),
      totalWorkerMs: fila(calientes, (x) => x.worker.total + x.worker.parseBase),
      paredClienteMs: fila(calientes, (x) => x.paredCliente),
      cpuWorkerdMs: fila(calientes, (x) => x.cpuWorkerd),
    },
  });
  console.log(JSON.stringify(resumen.at(-1)));
}
execSync('pkill -x workerd || true; pkill -f "[w]rangler dev" || true');
writeFileSync(join(aqui, 'resultados/tiempos-workerd.json'), JSON.stringify({ REPS, CALIENTES, resumen, crudo }, null, 2));
// Salida explícita: al matar wrangler puede quedar un socket keep-alive de
// undici abierto, que reventaba con UND_ERR_SOCKET DESPUÉS de escribir el JSON.
process.exit(0);
