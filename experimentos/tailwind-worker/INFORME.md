# CSS delta de Tailwind 4 dentro de un Worker: informe del estudio

> **Esto es un estudio, no producto.** El PR se queda en draft y no se mergea.
> No se ha desplegado nada: todo se midió en `wrangler dev` (workerd en local),
> en Node 22 y en Chromium 1194. El contenedor es Linux x86_64.

**Conclusión en tres líneas**

1. `compile()` de tailwindcss 4.3.3 corre en workerd **sin `nodejs_compat`**: el theme y sus plugins van empaquetados en un bundle de 835 KiB (157 KiB en gzip). Un compilador nuevo por petición tarda unos 36–42 ms en caliente y 102–132 ms en frío.
2. El delta es correcto **regla a regla** (Worker = Node byte a byte, y coincide con el build de la CLI) y **en el navegador**: 0 diferencias en hero, Markdown y clase inventada. Falla en un caso que no se puede evitar: una utilidad nueva y otra que ya está en la base compiten por la misma propiedad, y gana la que va detrás en el CSS.
3. Es viable **solo en el plan de pago** (en el gratuito, el `compile()` solo ya pasa de los 10 ms de CPU), con topes de entrada obligatorios. La alternativa de menor riesgo es generar el delta **en la publicación, desde un job**, con este mismo código.

## Montaje

| pieza | qué es |
|---|---|
| `src/delta.mjs` | extracción de candidatos (regex sobre `class=`), topes, parser CSS mínimo, resta de árboles y manifiesto. **El mismo fichero** corre en workerd y en Node |
| `src/compilador.mjs` | `compile()` con `loadStylesheet`/`loadModule` servidos desde lo empaquetado |
| `src/worker.mjs` | Worker: `POST /delta`, `GET /bench?n=`, `GET /reloj`, `GET /acumula`, `POST /crudo` (sin topes, solo para medir) |
| `scripts/empaquetar-assets.mjs` | copia `src/styles/global.css` del theme, hace el **CSS base** con la CLI de Tailwind 4.3.3 escaneando los fuentes reales del theme y genera `src/assets.generated.mjs` |
| `wrangler.jsonc` | `compatibility_date` 2026-04-15, **`compatibility_flags: []`** (sin `nodejs_compat`, a propósito) |

Versiones: tailwindcss 4.3.3, @tailwindcss/cli 4.3.3, @tailwindcss/typography 0.5.20,
tw-animate-css 1.4.0, shadcn 4.21.4 (solo su `tailwind.css`),
@fontsource-variable/geist 5.3.0, wrangler 4.149.0, Node 22.22.0.

**Puesta en marcha**, que es la base de todos los comandos de abajo:

```bash
cd experimentos/tailwind-worker
npm ci
npm run assets                     # CSS base + src/assets.generated.mjs
WRANGLER_SEND_METRICS=false npx wrangler dev --port 8799   # en otra terminal
```

**Qué se toma como «CSS base del site»**: el build de la CLI de Tailwind sobre
`global.css` con sus `@source` (components, layouts, widgets, pages), con
`--cwd` en un directorio vacío para que no haya autodetección. Sale con
**145,0 KiB y 927 clases**. No es byte a byte el CSS que emite `astro build`,
porque `@tailwindcss/vite` también detecta fuentes por el grafo de módulos.
**Sin verificar**: que el delta valga igual contra el CSS real de `dist/`.

## Las 7 preguntas

| # | pregunta | medida | comando que la reproduce | conclusión |
|---|---|---|---|---|
| 1 | ¿`compile()` funciona en workerd? | `POST /delta` devuelve CSS en workerd sin `nodejs_compat`. Carga 4 hojas (`tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`, `@fontsource-variable/geist`) y 1 módulo (`@tailwindcss/typography`). Ningún error de runtime. No hace falta oxide: los candidatos salen de una regex | `curl -s -X POST localhost:8799/delta -d '{"html":"<div class=\"bg-[#ff6600] md:grid-cols-3\"></div>"}'` | **funciona** |
| 2 | `@import`/`@plugin` sin sistema de ficheros | `loadStylesheet` sirve el texto empaquetado: 63,3 KiB de hojas (tailwindcss 29,1 · tw-animate 14,5 · shadcn 16,0 · geist 1,8) + 6,7 KiB del `global.css` del theme. `loadModule` sirve typography, ya importado en el bundle (57,9 KiB + 132,0 KiB de `postcss-selector-parser`). Un `@import`/`@plugin` que no esté en el mapa falla con nombre: `loadStylesheet: hoja no empaquetada: no-empaquetado.css` · `loadModule: módulo no empaquetado: @tailwindcss/forms (plugin)` | `npm run assets` (imprime los KiB) · el error: ver §2 | **funciona con estas limitaciones**: cada `@import`/`@plugin` nuevo de `global.css` hay que añadirlo a mano al mapa; las `url()` relativas de `@font-face` no se resuelven (no importa, porque la resta las quita: ya están en la base) |
| 3 | tamaño del bundle | `Total Upload: 834.81 KiB / gzip: 156.86 KiB` (`worker.js` = 854 843 B; `gzip -9` = 158 815 B). Es el 5,1 % del límite gratuito (3 MB comprimido) y el 1,5 % del de pago (10 MB). Desglose: tailwindcss 387,8 KiB · assets 239,4 KiB (de ellos, CSS base 145,0 y manifiesto 21,4) · postcss-selector-parser 132,0 · typography 57,9 · código propio 9,4 | `npm run dry-run` → `resultados/bundle-desglose.txt` | **funciona** |
| 4 | tiempo en frío y en caliente | Mediana de 5 arranques en frío y 50 peticiones en caliente, con un compilador nuevo por petición: ver la tabla de §4. En caliente, 36 / 38 / 42 ms dentro del Worker para 10 / 100 / 500 candidatos, y **`compile()` solo ya cuesta unos 30 ms**. En frío (primera compilación del isolate), 102 / 132 / 112 ms. En workerd local el reloj **sí avanza** con CPU pura: un bucle sin E/S midió 1181 ms con `performance.now()` | `npm run tiempos` · `npm run tiempos:node` · `curl localhost:8799/reloj` | **funciona con estas limitaciones**: no cabe en los 10 ms de CPU del plan gratuito; el CPU time de producción está **SIN VERIFICAR** (no hay deploy) |
| 5 | correctitud frente a un build conjunto | Worker = Node **byte a byte** en los 4 contenidos. Contra el build de la CLI, regla a regla: hero 15/15, Markdown 55/55, inventada 2/2. En cada uno, el bloque de variables del theme es un subconjunto con las declaraciones idénticas. Chromium (`getComputedStyle` de cada elemento, a 375 y 1280 px, en claro, en oscuro y con `:hover`): **0 diferencias** en base+delta frente a la referencia. El control con la base sola da 58–89 / 245 / 8 diferencias. El caso de control de cascada sale **4 propiedades distintas** | `npm run comparar` → `resultados/correctitud.json` | **funciona con estas limitaciones**: el delta va detrás de toda la base, así que si una utilidad nueva y otra de la base tocan la misma propiedad, no se respeta el orden que Tailwind daría en un build conjunto (§5) |
| 6 | cómo saber qué falta | El manifiesto saca las clases de los selectores del CSS base (927 clases, 21,4 KiB, solo `Set.has` en el Worker). Después, la **resta de árboles** quita lo que la base ya trae: variables del theme, `@property`, `@keyframes`, `@font-face`. Con 198 candidatos fuera del manifiesto hay **0 falsos negativos**. De las 927 clases del manifiesto, **3 son falsos positivos**: `animate-accordion-up`, `animate-accordion-down` y `shimmer` | `npm run manifiesto` → `resultados/manifiesto.json` | **funciona con estas limitaciones**: una clase que en la base solo sale en CSS escrito a mano (no como utilidad) se da por servida. `shimmer` se quedaría sin estilo (§6) |
| 7 | entradas hostiles | Sin topes, en workerd: un valor de 1 MB tarda 134 ms y saca 2 MB de CSS; 50 000 candidatos, 267 ms y 2,2 MB; 1000 variantes apiladas lanzan `Maximum call stack size exceeded` (se captura, no se cuelga); `[background-image:url(…)]` emite una `url()` externa; las llaves (`bg-[red;}body{…}]`) **no** se inyectan (0 bytes). Con topes, todo se rechaza (413 o filtrado). El peor caso dentro de los topes (500 candidatos de 116 caracteres) tarda **43–78 ms** y saca 157 KiB. Un `@apply` recursivo no se puede alcanzar desde el contenido; en el CSS del theme, `compile()` lanza `circular dependency` | `npm run seguridad` → `resultados/seguridad.json`, `resultados/seguridad-peor-caso.json` | **funciona con estas limitaciones**: los topes son obligatorios. La memoria del isolate está **SIN VERIFICAR**: solo se midió el RSS del proceso workerd, 235 → 348 MB a lo largo de la serie |

## Detalle por pregunta

### 1 · ¿Corre en workerd?

Sí. Se probó con `wrangler dev` 4.149.0 y **sin `nodejs_compat`**: ni
`tailwindcss` (`dist/lib.mjs`) ni typography ni `postcss-selector-parser`
necesitan APIs de Node una vez empaquetados por esbuild. No se probó con
`@cloudflare/vitest-pool-workers`, porque `wrangler dev` ya ejecuta el código
en workerd.

Respuesta a `{"html":"<div class=\"bg-[#ff6600] md:grid-cols-3 text-[13px] dark:bg-black hover:underline p-4\"></div>"}`.
Con el CSS base del theme, `text-[13px]`, `p-4` y `hover:underline` ya están
servidos y no se repiten (`yaEnBase: 3`):

```css
@layer utilities {
  .bg-\[\#ff6600\] { background-color: #ff6600; }
  @media (width >= 48rem) { .md\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .dark\:bg-black:is(.dark *) { background-color: var(--color-black); }
}
```

(Va compactado aquí; la salida real tiene una declaración por línea.)

### 2 · Resolución de `@import` y `@plugin`

`global.css` importa **cuatro** hojas, no dos: además de `tailwindcss` y
`tw-animate-css`, también `shadcn/tailwind.css` y `@fontsource-variable/geist`.
Todas van como texto en `assets.generated.mjs`, en un mapa `id → contenido`.
typography va como import estático. Los `@source` se quitan del CSS del Worker,
porque no hay nada que escanear.

Error medido con un id que no está en el mapa:

```bash
node --input-type=module -e "import { compilar } from './src/compilador.mjs';
try { await compilar('@import \"tailwindcss\";\n@import \"no-empaquetado.css\";') } catch (e) { console.log(e.message) }"
# → loadStylesheet: hoja no empaquetada: no-empaquetado.css   (resultados/import-no-empaquetado.txt)
```

### 3 · Tamaño

`npm run dry-run` ejecuta `wrangler deploy --dry-run --outdir out --metafile out/meta.json`
(no sube nada ni necesita credenciales), y luego `scripts/desglose-bundle.mjs`.
El CSS base y el manifiesto (166 KiB sin comprimir) van **embebidos** por
simplicidad. En un site real se leerían del binding `ASSETS`, y el bundle
quedaría en unos 670 KiB sin comprimir (**SIN VERIFICAR**: es una resta, no
una medida).

### 4 · Tiempo

`npm run tiempos` hace, para cada n, 5 arranques limpios de `wrangler dev`.
De cada arranque toma la 1.ª compilación del isolate (frío) y luego 10
peticiones más (caliente). Las medianas están en `resultados/tiempos-workerd.json`.
Los candidatos son sintéticos (`src/sinteticos.mjs`) y casi ninguno está en la
base.

| n | delta | frío: compile / build / resta / **total Worker** | frío: pared cliente | frío: CPU del proceso workerd | caliente: compile / build / resta / **total Worker** | caliente: pared | caliente: CPU del proceso workerd |
|---|---|---|---|---|---|---|---|
| 10 | 1,1 KiB | 80 / 7 / 16 / **102 ms** | 113,5 ms | 207,8 ms | 31 / 2 / 2 / **36 ms** | 44,1 ms | 73,7 ms |
| 100 | 16,4 KiB | 99 / 16 / 18 / **132 ms** | 142,4 ms | 251,2 ms | 31 / 4 / 2 / **38 ms** | 47,5 ms | 83,3 ms |
| 500 | 45,3 KiB | 76 / 20 / 17 / **112 ms** | 118,8 ms | 246,0 ms | 30 / 9 / 4 / **42 ms** | 50,1 ms | 86,4 ms |

Cómo se mide cada columna:

- **Total Worker**: `performance.now()` dentro del Worker. En workerd local el
  reloj avanza con CPU (`GET /reloj`: un bucle de 3·10⁸ iteraciones sin E/S
  da `performanceNowMs: 1181`, `dateNowMs: 1182`). Por eso en local este
  número ≈ CPU del hilo del isolate. **En producción el reloj está congelado
  entre E/S** (según la documentación de Cloudflare). Allí esta medida daría
  casi 0: **SIN VERIFICAR**, porque no hay deploy.
- **CPU del proceso workerd**: suma de `/proc/<pid>/task/*/schedstat`, todos
  los hilos. Cuenta de más respecto al CPU time que factura Cloudflare (que
  es el del isolate) porque incluye GC, E/S y los hilos del runtime. Es una
  cota superior.
- **El CPU time que reporta wrangler**: `wrangler dev` no lo reporta en local;
  se ve en `wrangler tail` o en el dashboard con un Worker desplegado.
  **SIN VERIFICAR** porque no se desplegó.
- **Referencia en Node** (`npm run tiempos:node`, el mismo código), mediana de
  10 en caliente: total 33,9 / 27,1 / 35,1 ms con 10 / 100 / 500 candidatos.
  `process.cpuUsage` da 67,2 / 47,1 / 57,8 ms. Es el mismo orden que workerd.

**Reutilizar el compilador** entre peticiones (`POST /delta?reuse=1`) baja el
caliente a **2–3 ms**, porque se ahorra el `compile()`. Pero `build()`
**acumula** los candidatos de todas las llamadas anteriores: tras 50 lotes, el
build de un solo candidato pasa de 14 875 a 18 693 bytes
(`curl 'localhost:8799/acumula?k=50'` → `resultados/acumula.json`), y el delta
de la 3.ª petición traía las reglas de las otras dos
(`resultados/reutilizar-compilador.txt`). Reutilizarlo sin más hace que la
memoria crezca sin límite y que un contenido arrastre clases de otro.

**Frente a los límites de Workers** (según la documentación de Cloudflare; aquí
no se verificaron): el plan gratuito da 10 ms de CPU por petición, y solo el
`compile()` ya ronda los 30 ms, así que **no cabe**. El de pago da 30 s por
defecto, y sobra margen.

### 5 · Correctitud

`npm run comparar` (con `wrangler dev` levantado) hace tres cosas con cada
contenido de `contenidos/`:

- **A · Regla a regla**: el delta del Worker frente al build de la CLI en
  Node, con `global.css` + `@source` del contenido renderizado. Cada regla se
  identifica por su ruta (`@layer › @media › selector`) y se compara con el
  mismo serializador en los dos lados.
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
- **Variantes** (`md:`, `dark:` como `:is(.dark *)`, `hover:` con
  `@media (hover: hover)`): idénticas a las del build conjunto.
- **Orden de capas — la limitación real**: el delta se añade **después** de
  todo el CSS base, en un segundo bloque `@layer utilities`. Dentro de la misma
  capa, el orden de las reglas lo da su posición en el CSS. En un build
  conjunto, Tailwind pone `p-*` antes que `px-*`, así que `px-3` gana en
  horizontal. Con el delta, `p-[18px]` va detrás y gana: `padding-left`,
  `padding-right`, `padding-inline-start` y `padding-inline-end` dan 18px en
  vez de 12px. Pasa siempre que una utilidad nueva y otra de la base, con la
  misma especificidad, tocan la misma propiedad.
- **Variantes**: dentro del propio delta, Tailwind mantiene su orden (las
  `@media` van detrás de las utilidades sin variante). El problema vuelve a
  aparecer entre el delta y la base: una utilidad nueva **sin** variante
  (p. ej. `grid-cols-3`) iría detrás de un `md:grid-cols-2` que ya está en la
  base, y le ganaría en `md`. Es el mismo mecanismo que el caso de control,
  pero este par concreto está **SIN VERIFICAR** en el navegador.

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

Validación (`npm run manifiesto`):

- **Falsos negativos: 0** de 198 candidatos sintéticos que no están en el manifiesto.
- **Falsos positivos: 3** de 927 (`animate-accordion-up`,
  `animate-accordion-down`, `shimmer`). Son clases que la base contiene como
  CSS escrito a mano (el `@layer utilities` de `global.css`, o `.shimmer`
  dentro de un `@media (prefers-reduced-motion)` de `shadcn/tailwind.css`),
  pero cuya **utilidad** de Tailwind (los `@utility` de tw-animate y shadcn)
  no se generó. Si un contenido nuevo usa `shimmer`, el Worker la da por
  servida y se queda sin estilo. Hace falta un manifiesto basado en
  candidatos, no en selectores (ver la recomendación). Que el efecto en el
  navegador sea real está **SIN VERIFICAR**: se dedujo del CSS.

Este test se ganó su sitio: la primera versión de la resta no fusionaba los
bloques con el mismo prelude, y con ella el test marcaba cientos de clases
como falsos positivos (esa salida no se conservó).

### 7 · Seguridad

Sin topes (`POST /crudo`, en workerd; `resultados/seguridad.json`):

| entrada | build | salida | nota |
|---|---|---|---|
| valor arbitrario de 100 KB | 17 ms | 200 KB | lineal con el tamaño |
| valor arbitrario de 1 MB | 134 ms | 2 MB | |
| `calc(` anidado 2000 niveles | 6 ms | 28 KB | no explota |
| 1000 variantes apiladas | — | — | `Maximum call stack size exceeded`: excepción, no cuelgue |
| 10 000 candidatos | 80 ms | 428 KB | |
| 50 000 candidatos | 267 ms | 2,2 MB | |
| `bg-[red;}body{display:none]` | 0 ms | 0 B | Tailwind descarta el candidato: **no hay inyección** |
| `[background-image:url(https://…)]` | 1 ms | 135 B | **emite la `url()` externa**: el navegador del visitante pide a un host que elige el autor |

RSS del proceso workerd a lo largo de la serie: 235 → 348 MB. No se forzó GC,
así que no es la memoria del isolate. El límite de 128 MB por isolate está
**SIN VERIFICAR**.

Topes implementados (`TOPES` y `filtrarCandidatos` en `src/delta.mjs`; se
aplican en `/delta`):

| tope | valor | cómo responde |
|---|---|---|
| cuerpo de la petición | 256 KiB | 413 |
| candidatos nuevos | 500 | 413 |
| longitud de un candidato | 120 caracteres | se filtra el candidato |
| variantes | 4 | se filtra el candidato |
| caracteres | rechaza `{ } ; \ < >` y la comilla invertida, y todo lo que no sea ASCII imprimible | se filtra el candidato |
| propiedades arbitrarias `[prop:valor]` y `url(` | rechazadas | se filtra el candidato; caen también las variantes arbitrarias `[&>p]:…` |

Con topes, cada una de las 8 entradas hostiles responde 413 o se filtra con su
motivo. El **peor caso dentro de los topes**
(`scripts/peor-caso-con-topes.mjs`: 500 candidatos distintos de 116 caracteres,
con `sm:md:hover:dark:` y `calc` anidado; 6 peticiones seguidas) da
**43–78 ms** dentro del Worker, 58–168 ms de pared y 157 KiB de delta.

`@apply` recursivo: el contenido aporta candidatos, nunca CSS, así que no
puede meter un `@apply`. En el CSS del theme, `compile()` lo corta con
`You cannot \`@apply\` the \`bar\` utility here because it creates a circular dependency.`
(medido en Node con el mismo `compilar()`).

## Lo que queda SIN VERIFICAR

- **CPU time real en producción**: no hay deploy. En local solo hay
  `performance.now()` (que allí avanza con CPU) y la cota superior de
  `/proc/*/schedstat`.
- **Memoria del isolate y el límite de 128 MB**: solo se midió el RSS del
  proceso workerd.
- **Arranque del isolate** (evaluar el bundle de 835 KiB): no se midió por
  separado. El «frío» de la tabla empieza con el módulo ya evaluado.
- **El delta contra el CSS real de `astro build`**: se usó el de la CLI sobre
  los mismos `@source`.
- **El efecto visual de los 3 falsos positivos del manifiesto**: deducido del
  CSS, no medido en el navegador.
- **El bundle sin el CSS base embebido** (unos 670 KiB): calculado restando, no medido.

## RECOMENDACIÓN

**El CSS delta en un Worker es viable técnicamente, pero no lo recomiendo como
primera opción.** Para usarlo hacen falta:

- **El plan de pago** de Workers: cada petición cuesta 36–78 ms de CPU, frente
  a los 10 ms del gratuito.
- **Topes de entrada obligatorios**, los de §7.
- **Un compilador nuevo por petición**, o uno reutilizado que se tire cada N
  usos y cuyo delta se filtre por las clases pedidas.
- **Caché del delta** por hash del conjunto de candidatos (en KV o Cache API),
  para no compilar en cada visita.
- **Aceptar** que una utilidad nueva y otra de la base que toquen la misma
  propiedad pueden resolverse distinto que en un build conjunto, y que el
  manifiesto por selectores tiene falsos positivos.

**La alternativa de menor riesgo es generar el delta en la publicación, desde
un job**: el mismo `compile()` en Node cuando el cliente guarda el contenido.

- Quita la CPU, la memoria y el DoS de la ruta de cada visita.
- El delta queda como un asset estático versionado.
- Permite usar el escáner oxide y un manifiesto de **candidatos**, no de
  selectores: eso elimina los falsos positivos.

Este código (`src/delta.mjs` + `src/compilador.mjs`) sirve tal cual para el
job; ya se probó en Node en este estudio. Para los contenidos cuyo vocabulario
se conoce, las **variantes cerradas precompiladas** (un safelist en
`global.css` con `@source inline(...)`) son todavía más simples: sin delta y
sin orden de capas. A cambio, no cubren valores arbitrarios como
`bg-[#ff6600]`.
