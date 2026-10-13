# CSS delta de Tailwind 4 dentro de un Worker: informe del estudio

> **Esto es un estudio, no producto.** El PR se queda en draft y no se mergea.
> No se ha desplegado nada: todo se midió en `wrangler dev` (workerd en local),
> en Node y en Chromium. El entorno exacto está en `resultados/entorno.json`:
> Node v22.22.0, linux x64, Chromium 141.0.7390.37, wrangler 4.149.0,
> workerd 1.20261006.1 y tailwindcss 4.3.3. Lo regenera `npm run entorno`.

**Conclusión en tres líneas**

1. `compile()` de tailwindcss 4.3.3 corre en workerd **sin `nodejs_compat`**: con el theme y sus plugins empaquetados, el bundle pesa 836 KiB (157 KiB en gzip). Con un compilador nuevo por petición, la petición tarda 35–44 ms en caliente y 106–120 ms en frío. Es tiempo medido con `performance.now()` en workerd local, no CPU de producción.
2. El delta es correcto **regla a regla** (Worker = Node byte a byte, y coincide con el build de la CLI) y **en el navegador**: 0 diferencias en hero, Markdown y clase inventada. Falla en un caso que no se puede evitar: una utilidad nueva y otra que ya está en la base compiten por la misma propiedad, y gana la que va detrás en el CSS.
3. Lo veo viable **solo en el plan de pago**, con topes de entrada obligatorios: solo el `compile()` ronda los 30 ms y el plan gratuito da 10 ms de CPU, según la documentación de Cloudflare. El CPU de producción está SIN VERIFICAR. La alternativa de menor riesgo es generar el delta **en la publicación, desde un job**, con este mismo código.

## Montaje

| pieza | qué es |
|---|---|
| `src/delta.mjs` | extracción de candidatos (regex sobre `class=`), topes, parser CSS mínimo, resta de árboles y manifiesto. **El mismo fichero** corre en workerd y en Node |
| `src/compilador.mjs` | `compile()` con `loadStylesheet`/`loadModule` servidos desde lo empaquetado |
| `src/worker.mjs` | Worker: `POST /delta`, `GET /bench?n=`, `GET /reloj`, `GET /acumula`, `POST /crudo` (sin topes, solo para medir) |
| `scripts/empaquetar-assets.mjs` | copia `src/styles/global.css` del theme, hace el **CSS base** con la CLI de Tailwind 4.3.3 escaneando los fuentes reales del theme y genera `src/assets.generated.mjs` |
| `wrangler.jsonc` | `compatibility_date` 2026-04-15, **`compatibility_flags: []`** (sin `nodejs_compat`, a propósito) |

**Puesta en marcha**, que es la base de todos los comandos de abajo:

```bash
cd experimentos/tailwind-worker
npm ci
npm run assets          # CSS base + src/assets.generated.mjs; KiB en resultados/assets.json
WRANGLER_SEND_METRICS=false npx wrangler dev --port 8799   # en otra terminal
```

Cada script escribe su evidencia en `resultados/`. **Qué se toma como «CSS base
del site»**: el build de la CLI de Tailwind sobre `global.css` con sus
`@source` (components, layouts, widgets, pages), con `--cwd` en un directorio
vacío para que no haya autodetección. Sale con **145,0 KiB y 927 clases**
(`resultados/assets.json`). No es byte a byte el CSS que emite `astro build`,
porque `@tailwindcss/vite` también detecta fuentes por el grafo de módulos.
**Sin verificar**: que el delta valga igual contra el CSS real de `dist/`.

## Las 7 preguntas

| # | pregunta | medida | comando que la reproduce | conclusión |
|---|---|---|---|---|
| 1 | ¿`compile()` funciona en workerd? | `POST /delta` devuelve CSS en workerd sin `nodejs_compat`. Carga 4 hojas (`tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`, `@fontsource-variable/geist`) y 1 módulo (`@tailwindcss/typography`): campo `cargas` de `resultados/ejemplo-delta.json`. Ningún error de runtime. No hace falta oxide: los candidatos salen de una regex | `npm run ejemplos` (con un isolate recién arrancado) | **funciona** |
| 2 | `@import`/`@plugin` sin sistema de ficheros | `loadStylesheet` sirve el texto empaquetado: **61,4 KiB** de hojas (tailwindcss 29,1 · tw-animate-css 14,5 · shadcn 16,0 · geist 1,8) + 6,7 KiB del `global.css` del theme. `loadModule` sirve typography, ya importado en el bundle (57,9 KiB + 132,0 KiB de `postcss-selector-parser`). Un id que no esté en el mapa falla con nombre: `loadStylesheet: hoja no empaquetada: no-empaquetado.css` · `loadModule: módulo no empaquetado: @tailwindcss/forms (plugin)` | `npm run assets` → `resultados/assets.json` · `npm run dry-run` → `resultados/bundle-desglose.txt` · `npm run import-no-empaquetado` → `resultados/import-no-empaquetado.txt` | **funciona con estas limitaciones**: cada `@import`/`@plugin` nuevo de `global.css` hay que añadirlo a mano al mapa; las `url()` relativas de `@font-face` no se resuelven (no importa, porque la resta las quita: ya están en la base) |
| 3 | tamaño del bundle | wrangler: `Total Upload: 835.64 KiB / gzip: 157.08 KiB`. `worker.js` = 855 697 B; `gzip -9` = 159 033 B. Con los límites que da la documentación de Cloudflare (3 MB comprimido en el plan gratuito, 10 MB en el de pago) es el 5,1 % y el 1,5 %. Desglose: tailwindcss 387,8 KiB · assets 239,4 KiB · postcss-selector-parser 132,0 · typography 57,9 · código propio 10,2 · cssesc + util-deprecate 4,2 | `npm run dry-run` → `resultados/dry-run.txt` y `resultados/bundle-desglose.txt` | **funciona** |
| 4 | tiempo en frío y en caliente | Mediana de 5 arranques en frío y 50 peticiones en caliente, con un compilador nuevo por petición (tabla de §4). Caliente: **35 / 37 / 44 ms** dentro del Worker para 10 / 100 / 500 candidatos, de los que **`compile()` solo son 29–30 ms**. Frío (primera compilación del isolate): **106 / 111 / 120 ms**. En workerd local el reloj **sí avanza** con CPU pura: un bucle sin E/S midió 1262 ms con `performance.now()` | `npm run tiempos` → `resultados/tiempos-workerd.json`, `resultados/tiempos-frio-desglose.txt` · `npm run tiempos:node` · `npm run ejemplos` → `resultados/reloj.json` | **funciona con estas limitaciones**: por lo medido en local, no cabría en los 10 ms de CPU del plan gratuito (límite según la documentación). El CPU time de producción está **SIN VERIFICAR** (no hay deploy) |
| 5 | correctitud frente a un build conjunto | Worker = Node **byte a byte** en los 4 contenidos. Contra el build de la CLI, regla a regla: hero 15/15, Markdown 55/55, inventada 2/2. En cada uno, el bloque de variables del theme es un subconjunto con las declaraciones idénticas. Chromium (`getComputedStyle` de cada elemento, a 375 y 1280 px, en claro, en oscuro y con `:hover`): **0 diferencias** en base+delta frente a la referencia. El control con la base sola da 58–89 / 245 / 8 diferencias. El caso de control de cascada sale **4 propiedades distintas** | `npm run comparar` → `resultados/correctitud.json` | **funciona con estas limitaciones**: el delta va detrás de toda la base, así que si una utilidad nueva y otra de la base tocan la misma propiedad, no se respeta el orden que Tailwind daría en un build conjunto (§5) |
| 6 | cómo saber qué falta | El manifiesto saca las clases de los selectores del CSS base (927 clases, 21,4 KiB de JSON, solo `Set.has` en el Worker). Después, la **resta de árboles** quita lo que la base ya trae: variables del theme, `@property`, `@keyframes`, `@font-face`. Con 198 candidatos fuera del manifiesto hay **0 falsos negativos**. De las 927 clases del manifiesto, **3 son falsos positivos**: `animate-accordion-up`, `animate-accordion-down` y `shimmer` | `npm run manifiesto` → `resultados/manifiesto.json` | **funciona con estas limitaciones**: una clase que en la base solo sale en CSS escrito a mano (no como utilidad) se da por servida (§6) |
| 7 | entradas hostiles | Sin topes, en workerd: 1000 variantes apiladas tardan **387 ms** y sacan 2 MB, con el RSS de workerd +164 MB (en una pasada anterior lanzaron `Maximum call stack size exceeded`). Un valor de 1 MB tarda 85 ms y saca 2 MB; 50 000 candidatos, 306 ms y 2,2 MB. `[…:url(…)]` y `bg-[url(…)]` emiten una `url()` externa. Las llaves **no** se inyectan (0 bytes). Con topes, las 11 entradas hostiles responden 413 o se filtran con su motivo. El peor caso dentro de los topes (500 candidatos de 116 caracteres) tarda **44–76 ms** y saca 157 KiB. Un `@apply` recursivo no se puede alcanzar desde el contenido; en el CSS del theme, `compile()` lanza `circular dependency` | `npm run seguridad` → `resultados/seguridad.json`, `resultados/seguridad-peor-caso.json` | **funciona con estas limitaciones**: los topes son obligatorios. La memoria del isolate está **SIN VERIFICAR**: solo se midió el RSS del proceso workerd |

## Detalle por pregunta

### 1 · ¿Corre en workerd?

Sí. Se probó con `wrangler dev` y **sin `nodejs_compat`**: ni `tailwindcss`
(`dist/lib.mjs`) ni typography ni `postcss-selector-parser` necesitan APIs de
Node una vez empaquetados por esbuild. No se probó con
`@cloudflare/vitest-pool-workers`, porque `wrangler dev` ya ejecuta el código
en workerd.

`resultados/ejemplo-delta.json` guarda la respuesta completa a
`<div class="bg-[#ff6600] md:grid-cols-3 text-[13px] dark:bg-black hover:underline p-4">`.
`text-[13px]`, `p-4` y `hover:underline` ya están en el CSS base
(`yaEnBase: 3`), y el delta trae solo esto:

```css
@layer utilities {
  .bg-\[\#ff6600\] { background-color: #ff6600; }
  @media (width >= 48rem) { .md\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .dark\:bg-black:is(.dark *) { background-color: var(--color-black); }
}
```

(Va compactado aquí; el JSON trae una declaración por línea.)

### 2 · Resolución de `@import` y `@plugin`

`global.css` importa **cuatro** hojas, no dos: además de `tailwindcss` y
`tw-animate-css`, también `shadcn/tailwind.css` y `@fontsource-variable/geist`.
Todas van como texto en `assets.generated.mjs`, en un mapa `id → contenido`.
typography va como import estático. Los `@source` se quitan del CSS del Worker,
porque no hay nada que escanear.

Con un id que no está en el mapa, `compile()` rechaza con el mensaje de
`src/compilador.mjs`, que nombra la hoja o el módulo
(`scripts/import-no-empaquetado.mjs`, en Node con el mismo `compilar()`).

### 3 · Tamaño

`npm run dry-run` ejecuta `wrangler deploy --dry-run --outdir out --metafile out/meta.json`
(no sube nada ni necesita credenciales). Guarda la línea `Total Upload` y el
`gzip -9` en `resultados/dry-run.txt`, y el desglose por módulo (desde
`meta.json`) en `resultados/bundle-desglose.txt`.

El CSS base (145,0 KiB) y el manifiesto (21,4 KiB) van **embebidos** por
simplicidad. En un site real se leerían del binding `ASSETS`, y el bundle
quedaría en unos 669 KiB sin comprimir (835,6 − 166,4). **SIN VERIFICAR**: es
una resta, no una medida.

### 4 · Tiempo

`npm run tiempos` hace, para cada n, 5 arranques limpios de `wrangler dev`.
De cada arranque toma la 1.ª petición que compila (frío; el JSON la marca
`frio: true` en 5/5) y 10 peticiones más en caliente. Las medianas están en
`resultados/tiempos-workerd.json`. Los candidatos son sintéticos
(`src/sinteticos.mjs`) y casi ninguno está en la base.

| n | delta | frío: compile / build / parseo base / resta | frío: **total Worker** | frío: pared | frío: CPU workerd | caliente: compile / build / resta | caliente: **total Worker** | caliente: pared | caliente: CPU workerd |
|---|---|---|---|---|---|---|---|---|---|
| 10 | 1,1 KiB | 83 / 9 / 12 / 3 | **106 ms** | 117,6 ms | 218,2 ms | 29 / 2 / 2 | **35 ms** | 42,6 ms | 72,9 ms |
| 100 | 16,4 KiB | 85 / 14 / 10 / 6 | **111 ms** | 119,8 ms | 219,4 ms | 30 / 4 / 2 | **37 ms** | 44,3 ms | 79,8 ms |
| 500 | 45,3 KiB | 79 / 27 / 11 / 8 | **120 ms** | 128,5 ms | 243,7 ms | 30 / 9 / 4 | **44 ms** | 50,8 ms | 86,6 ms |

Cada columna es una mediana por separado, así que las partes no suman
exactamente el total.

- **Parseo base**: parsear el CSS base de 145 KiB, solo en la 1.ª petición
  del isolate. El total en frío lo incluye.
- **Total Worker**: `performance.now()` dentro del Worker. En workerd local el
  reloj avanza con CPU (`resultados/reloj.json`: un bucle de 3·10⁸
  iteraciones sin E/S da `performanceNowMs: 1262`, `dateNowMs: 1262`). Por
  eso en local este número ≈ CPU del hilo del isolate. **En producción el
  reloj está congelado entre E/S** (según la documentación de Cloudflare);
  allí esta medida daría casi 0. **SIN VERIFICAR**, porque no hay deploy.
- **CPU workerd**: suma de `/proc/<pid>/task/*/schedstat` de todos los hilos
  del proceso. Cuenta de más respecto al CPU time que factura Cloudflare (el
  del isolate) porque incluye GC, E/S y los hilos del runtime. Es una cota
  superior.
- **El CPU time que reporta wrangler**: `wrangler dev` no lo reporta en local;
  se ve en `wrangler tail` o en el dashboard con un Worker desplegado.
  **SIN VERIFICAR** porque no se desplegó.
- **Referencia en Node** (`npm run tiempos:node` → `resultados/tiempos-node.json`,
  el mismo código), mediana de 10 en caliente: total 33,9 / 27,1 / 35,1 ms
  con 10 / 100 / 500 candidatos. `process.cpuUsage` da 67,2 / 47,1 / 57,8 ms.
  Es el mismo orden que workerd.

**Reutilizar el compilador** entre peticiones (`POST /delta?reuse=1`;
`npm run ejemplos` → `resultados/reutilizar-compilador.json`): la 1.ª petición
tarda 127 ms y las siguientes **2–4 ms**, porque se ahorran el `compile()`.
Pero `build()` **acumula** los candidatos de todas las llamadas anteriores:

- En `/delta?reuse=1`, el delta de la 2.ª petición trajo 2 reglas `.bg-` y el
  de la 3.ª trajo 3: arrastran las clases de las peticiones anteriores.
- En `/acumula`, tras 50 lotes, el build de un solo candidato pasa de 14 875 a
  18 693 bytes (`resultados/acumula.json`).

Lo medido es que la salida crece con cada llamada. **Deducido, no medido**: la
memoria del compilador también crece mientras viva el isolate.

**Frente a los límites de Workers** (según la documentación de Cloudflare; aquí
no se verificaron): el plan gratuito da 10 ms de CPU por petición y el de
pago, 30 s por defecto. Si el CPU de producción se parece al
`performance.now()` local, solo el `compile()` (unos 30 ms) ya no cabe en el
gratuito.

### 5 · Correctitud

`npm run comparar` (con `wrangler dev` levantado) hace tres cosas con cada
contenido de `contenidos/`:

- **A · Regla a regla**: el delta del Worker frente al build de la CLI en
  Node, con `global.css` + `@source` del contenido renderizado (el Markdown se
  pasa a HTML con `marked` dentro de
  `<article class="prose prose-lg dark:prose-invert prose-a:text-[#ff6600] max-w-none">`).
  Cada regla se identifica por su ruta (`@layer › @media › selector`) y se
  compara con el mismo serializador en los dos lados.
- **B · Worker frente a Node**: los mismos bytes.
- **C · Chromium**: `getComputedStyle` de todas las propiedades de cada
  elemento, a 375 y 1280 px, en claro y con `.dark`, más el `:hover` real con
  el ratón. Se compara la referencia, base+delta y la base sola (control).

| contenido | faltan | delta | A: reglas idénticas | B | C: difs base+delta (control: base sola) |
|---|---|---|---|---|---|
| hero (`bg-[#ff6600]`, `md:grid-cols-3`, `dark:`, `hover:`) | 13 | 1483 B | 14 + 1 bloque de variables | = | **0** en los 4 modos (58–89); 1 elemento con hover (9–19 difs de hover en el control) |
| Markdown con `prose` (`prose-lg`, `prose-a:text-[#ff6600]`, `not-prose`) | 8 | 8190 B | 54 + 1 bloque de variables | = | **0** (245) |
| `text-[13px]` (+ `leading-[1.15]`, `tracking-[0.02em]`) | 2 | 180 B | 2 | = | **0** (8) |
| control de cascada: `px-3 p-[18px]` | 2 | 211 B | 2 + 1 bloque de variables | = | **4** (10) |

Diferencias documentadas:

- **`@theme`**: el delta emite en `@layer theme { :root, :host { … } }` solo
  las variables **nuevas** (p. ej. `--color-orange-400`). Cada declaración es
  idéntica a la del build conjunto. El bloque es un subconjunto, no una copia.
- **`text-[13px]` ya estaba** en el CSS base (lo usa el theme), así que no
  sale en el delta: el manifiesto funcionó.
- **Variantes** (`md:`, `dark:` como `:is(.dark *)`, `hover:` como
  `@media (hover: hover) { …:hover }`, en `resultados/delta-hero.css`):
  idénticas a las del build conjunto.
- **Orden de capas — la limitación real**: el delta se añade **después** de
  todo el CSS base, en un segundo bloque `@layer utilities`. Dentro de la misma
  capa, el orden de las reglas lo da su posición en el CSS. En el build
  conjunto, `p-[18px]` va antes que `px-3` (`fixtures/ref-conflicto.css`, que regenera `npm run comparar`:
  líneas 1602 y 1623), así que `px-3` gana en horizontal. Con el delta,
  `p-[18px]` va detrás y gana: `padding-left`, `padding-right`,
  `padding-inline-start` y `padding-inline-end` dan 18px en vez de 12px. Pasa
  siempre que una utilidad nueva y otra de la base, con la misma
  especificidad, tocan la misma propiedad.
- **Variantes frente a la base**: dentro del propio delta, Tailwind mantiene
  su orden (las `@media` van detrás de las utilidades sin variante). El
  problema vuelve a aparecer entre el delta y la base: una utilidad nueva
  **sin** variante (p. ej. `grid-cols-3`) iría detrás de un `md:grid-cols-2`
  que ya está en la base, y le ganaría en `md`. Es el mismo mecanismo que el
  caso de control, pero este par concreto está **SIN VERIFICAR** en el
  navegador.

### 6 · Qué falta: el método

1. **En el build** (o al publicar), el manifiesto: todas las clases que
   aparecen en un selector del CSS servido (`manifiestoDeClases`, que
   desescapa `\:`, `\[`… y los escapes hex).
2. **En el Worker**, los candidatos que no están en el manifiesto pasan a
   `build()`.
3. **Resta de árboles** (`restarArbol`) contra el CSS base: se compara bloque
   a bloque por prelude y declaración a declaración. Así no se repiten las
   variables del theme, los `@property`, los `@keyframes` ni los `@font-face`
   que la base ya trae. Si varios bloques comparten prelude (el theme abre su
   propio `@layer utilities`), se fusionan antes de comparar.

Validación (`npm run manifiesto` → `resultados/manifiesto.json`):

- **Falsos negativos: 0** de 198 candidatos sintéticos que no están en el manifiesto.
- **Falsos positivos: 3** de 927. Son clases que la base contiene como CSS
  escrito a mano, pero cuya utilidad de Tailwind no se generó porque ningún
  fuente la usa tal cual:
  - **`shimmer`**: shadcn la define como `@utility shimmer`. La base solo trae
    la regla `.shimmer` escrita a mano dentro del
    `@media (prefers-reduced-motion: reduce)` de `shadcn/tailwind.css`. Si un
    contenido nuevo usa `shimmer`, el Worker la da por servida y la utilidad
    no llega.
  - **`animate-accordion-up` / `animate-accordion-down`**: la base trae la
    regla escrita a mano del `@layer utilities` de `global.css`. La utilidad
    `animate-*` del núcleo de Tailwind (que usa las variables
    `--animate-accordion-*` del theme) no se generó.

  Que tenga efecto en el navegador está **SIN VERIFICAR**: se dedujo del CSS.

### 7 · Seguridad

Sin topes (`POST /crudo` en workerd, `resultados/seguridad.json`; «muestra» es
el principio de lo que añade el build):

| entrada | build | salida | nota |
|---|---|---|---|
| valor arbitrario de 100 KB | 11 ms | 200 KB | |
| valor arbitrario de 1 MB | 85 ms | 2 MB | RSS de workerd +74 MB |
| `calc(` anidado 2000 niveles | 15 ms | 28 KB | no explota |
| 1000 variantes `hover:` apiladas | 387 ms | 2 MB | 1000 `@media (hover: hover)` anidadas; RSS +164 MB. En una pasada anterior lanzó `Maximum call stack size exceeded` (salida no conservada): el resultado no es determinista |
| 5 variantes cortas (`sm:md:lg:hover:focus:`) | 1 ms | 252 B | |
| 10 000 candidatos | 63 ms | 428 KB | |
| 50 000 candidatos | 306 ms | 2,2 MB | |
| `bg-[red;}body{display:none]`, `bg-[red}*{color:red]` | 1 ms | 0 B | Tailwind descarta los candidatos: **no hay inyección** |
| `[background-image:url(https://…)]` | 1 ms | 135 B | **emite `background-image: url(https://ejemplo.invalid/p.png)`**: el navegador del visitante pide a un host que elige el autor |
| `bg-[url(https://…)]` | 1 ms | 120 B | ídem |
| variante arbitraria `[&_p]:mt-[7px]` | 2 ms | 56 B | selector `… p` |

RSS del proceso workerd a lo largo de la serie: 231 → 484 MB. No se forzó GC,
así que no es la memoria del isolate. El límite de 128 MB por isolate (según
la documentación) está **SIN VERIFICAR**.

Topes implementados (`TOPES` y `filtrarCandidatos` en `src/delta.mjs`; se
aplican en `/delta`):

| tope | valor | cómo responde |
|---|---|---|
| cuerpo de la petición | 256 KiB (bytes UTF‑8) | 413 |
| candidatos nuevos | 500 | 413 |
| longitud de un candidato | 120 caracteres | se filtra el candidato |
| variantes | 4 | se filtra el candidato |
| caracteres | rechaza `{ } ; \ < >` y la comilla invertida, y todo lo que no sea ASCII imprimible | se filtra el candidato |
| propiedades y variantes arbitrarias (`[` al principio de un segmento) | rechazadas | se filtra el candidato (`propiedad-arbitraria`) |
| `url(` | rechazada | se filtra el candidato |

Con topes, cada una de las 11 entradas hostiles responde 413 o se filtra con
su motivo (`resultados/seguridad.json`, campo `conTopes`): `longitud`,
`caracteres`, `variantes`, `propiedad-arbitraria`, `url`, o
413 «entrada demasiado grande» / «demasiados candidatos».

El **peor caso dentro de los topes** (`scripts/peor-caso-con-topes.mjs`: 500
candidatos distintos de 116 caracteres, con `sm:md:hover:dark:` y `calc`
anidado; 6 peticiones seguidas) da **44–76 ms** dentro del Worker, 58–189 ms
de pared y 157 KiB de delta (`resultados/seguridad-peor-caso.json`).

`@apply` recursivo: el contenido aporta candidatos, nunca CSS, así que no
puede meter un `@apply`. En el CSS del theme, `compile()` lo corta con
`You cannot \`@apply\` the \`bar\` utility here because it creates a circular dependency.`
(medido en Node con el mismo `compilar()`; última fila de `resultados/seguridad.log`).

## Lo que queda SIN VERIFICAR

- **CPU time real en producción**: no hay deploy. En local solo hay
  `performance.now()` (que allí avanza con CPU) y la cota superior de
  `/proc/*/schedstat`.
- **Los límites de Workers** (10 ms y 30 s de CPU, 128 MB, 3 y 10 MB de
  bundle): vienen de la documentación de Cloudflare, no de una medida.
- **Memoria del isolate**: solo se midió el RSS del proceso workerd.
- **Arranque del isolate** (evaluar el bundle de 836 KiB): no se midió por
  separado. El «frío» de la tabla empieza con el módulo ya evaluado.
- **El delta contra el CSS real de `astro build`**: se usó el de la CLI sobre
  los mismos `@source`.
- **El efecto visual de los 3 falsos positivos del manifiesto** y del par
  variante/base de §5: deducido del CSS, no medido en el navegador.
- **El bundle sin el CSS base embebido** (unos 669 KiB): calculado restando,
  no medido.
- **Que un manifiesto de candidatos** (en vez de selectores) elimine los
  falsos positivos: es la propuesta de abajo, no está probada.

## RECOMENDACIÓN

**El CSS delta en un Worker es viable técnicamente, pero no lo recomiendo como
primera opción.** Para usarlo hacen falta:

- **El plan de pago** de Workers. En local, cada petición cuesta 35–44 ms en
  caliente, 106–120 ms en frío y hasta 76 ms en el peor caso con topes, frente
  a los 10 ms de CPU del gratuito. El CPU de producción está SIN VERIFICAR.
- **Topes de entrada obligatorios**, los de §7. Sin ellos, una sola clase hace
  que la petición tarde cientos de ms, saque 2 MB y suba cientos de MB de RSS.
- **Un compilador nuevo por petición**, o uno reutilizado que se tire cada N
  usos y cuyo delta se filtre por las clases pedidas (no implementado).
- **Caché del delta** por hash del conjunto de candidatos (en KV o Cache API),
  para no compilar en cada visita.
- **Aceptar** que una utilidad nueva y otra de la base que toquen la misma
  propiedad pueden resolverse distinto que en un build conjunto, y que el
  manifiesto por selectores tiene falsos positivos.

**La alternativa de menor riesgo es generar el delta en la publicación, desde
un job**: el mismo `compile()` en Node cuando el cliente guarda el contenido.

- Quita la CPU, la memoria y el DoS de la ruta de cada visita.
- El delta queda como un asset estático versionado.
- Permite usar el escáner oxide y, previsiblemente, un manifiesto de
  candidatos en vez de selectores (SIN VERIFICAR).

Este código (`src/delta.mjs` + `src/compilador.mjs`) sirve tal cual para el
job; ya se probó en Node en este estudio. Para los contenidos cuyo vocabulario
se conoce, las **variantes cerradas precompiladas** (un safelist en
`global.css` con `@source inline(...)`) son todavía más simples: sin delta y
sin orden de capas. A cambio, no cubren valores arbitrarios como
`bg-[#ff6600]`.
