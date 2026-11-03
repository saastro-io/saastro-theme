# CSS crítico: cómo funciona, cómo se mantiene y qué hereda un site

> **Qué es.** En la primera visita (caché vacía) el navegador no pinta nada hasta bajar el CSS que bloquea el render. Con el CSS en `<link>` eso son dos vueltas de red antes del primer pintado. Este mecanismo deja **inline solo las reglas que esa página usa** y manda el resto del CSS (completo, cacheable, compartido entre páginas) al final del `<body>`. Vale igual para las páginas prerenderizadas y para las rutas del Worker (`/lp/*`, `/p/<slug>`, el 404).
>
> **Qué NO hace falta**: configurar nada por ruta, por página ni por site; listas de rutas, umbrales, safelist. **Sin JS, sin `onload`, sin tocar la CSP** (`public/_headers` y `src/lib/security-headers.ts` no cambian).
>
> **Cómo leerlo.** Cada cifra lleva su comando en el cuerpo del PR que lo introdujo; aquí solo la mecánica y el contrato.

## Cómo funciona

Un solo motor, [Beasties](https://github.com/danielroe/beasties) `beasties/runtime` (27 kB, sin dependencias), en dos sitios:

1. **Build** (`astro:build:done`, `src/integrations/critical-css.mjs`). Compila cada `.css` de `dist/client` en un *plan* (`<hoja>.css.plan.json`, un asset más junto a la hoja) y procesa con él el HTML prerenderizado: inlina las reglas que la página usa y mueve el `<link rel=stylesheet>` al final del `<body>`.
2. **Worker** (`src/integrations/critical-css-middleware.ts`, middleware `post`). Las rutas SSR no pasan por el build. El middleware lee los `<link rel=stylesheet>` de la respuesta, carga el plan de cada hoja del binding `ASSETS` (una vez por isolate, luego en memoria), y hace lo mismo con la respuesta. **Por qué lee los nombres de la respuesta y no del build**: la hoja lleva un hash en el nombre que solo existe cuando termina el build cliente, y el bundle del Worker se construye antes. El HTML a entregar ya trae los nombres.

Degrada sin romper: sin binding `ASSETS` (dev), sin plan o ante cualquier excepción la respuesta sale como la dejó la página, con su `<link>` de siempre. Esa degradación es silenciosa a propósito, así que **quien la vigila es `critical-css-check`** (abajo).

Decisiones que no son obvias:

- `@font-face`: el motor decide qué caras inlinar mirando los `font-family` de las reglas críticas. Aquí la familia llega por un token (`--font-body: "Geist Variable"`), así que `critical-css.mjs` declara como familia cada custom property cuyo nombre contiene «font». Las caras con `unicode-range` se inlinan solo si el texto de la página usa ese rango.
- `keyframes`: solo los que usa una regla crítica.
- Reglas siempre críticas (`ALLOW_RULES`, abajo).

## Qué hereda un descendiente

Al traer el theme llegan: la integración, la dependencia `beasties` (devDependency: el Worker la empaqueta), el script `critical-css-check` encadenado en `pnpm studio:check` y el cambio del hash de `astro.config.mjs` en `studio-contract.json` (`pnpm studio:contract:update`). **Nada más**: ni lista de rutas ni configuración. Un CSS global propio de Claude Design (Tailwind + bloques propios) se cubre solo: el HTML por vista y el LCP no dependen del tamaño total del CSS, solo de lo que la página usa.

Lo único que puede pedir un descendiente es **añadir un estado previo al pintado propio** a `ALLOW_RULES`.

## Un estado previo al pintado propio → `ALLOW_RULES`

El análisis es **estático** sobre el HTML que sale del servidor. Ve etiquetas, clases, ids y atributos. **No ve** lo que un script del `<head>` pone en `<html>` antes de pintar ni lo que `var()` resuelve. El theme ya tiene uno: `ApplyColorMode` pone `.dark` en `<html>`; por eso `.dark` está en la lista. Si tu site pone otro (`<html class="skin-warm">`, `.js`, `data-skin`…) y el CSS lo usa como raíz de selectores (`.skin-warm .hero {…}`), esas reglas no entran en el crítico: la página pinta sin ellas y salta al llegar el CSS completo.

Cómo se ve y cómo se arregla:

1. **El build avisa** si un script inline del `<head>` pone una clase o un atributo en `<html>` y el CSS tiene selectores con ellos que ninguna regla de la lista cubre. Texto real (medido con una clase `skin-warm`): `un script del <head> pone «.skin-warm» en <html> y 2 selectores del CSS lo usan sin estar en ALLOW_RULES (p. ej. «.skin-warm .syn-hero»): la página pinta sin esas reglas hasta que llega el CSS completo. Añade su selector a ALLOW_RULES en src/integrations/critical-css-config.mjs`. Detecta `documentElement.classList.add|toggle|replace('x')`, `setAttribute('data-x', …)` y `dataset.x`; un estado que se ponga de otra forma no lo ve el aviso, pero sí el control.
2. **`pnpm studio:check` falla** (`critical-css-check`) con la diferencia de estilo computado, el elemento y la propiedad, en claro u oscuro.
3. **Arreglo**: añade el selector a `ALLOW_RULES` en `src/integrations/critical-css-config.mjs`, p. ej. `/^\.skin-warm(?![\w-])/`, reconstruye, y el control vuelve a verde.

Evita crear estados nuevos: ya lo dice [diseno-con-claude.md](diseno-con-claude.md#reglas-de-css-y-rendimiento) (nada de `no-js`/`loading` en `<html>`). Si hace falta uno, es una línea en `ALLOW_RULES`.

Otros selectores que el motor descartaba **en silencio** y por eso están en la lista (los tres los rompió algo real, medido): `.dark`, `:root:has(...)` (lo cubre el patrón `:root`) y los que empiezan por `:where(`/`:is(`/`:not(` (el `space-y-*` de Tailwind: el pie perdía 32 px de alto).

## El control: `scripts/critical-css-check.mjs`

Corre en `pnpm studio:check` (y suelto: `pnpm critical-css:check`, tras `astro build`). Arranca el Worker construido —el mismo workerd que `cabeceras-worker-check`, que sirve también los assets— y para **cada página**: todo el HTML de `dist/client` + un 404 + cada landing de `src/content/lp` (vista previa firmada, sin publicar nada) + una página de «páginas como datos» con todos los bloques del site (contra un Hub de mentira):

- Carga dos veces, en **claro y oscuro**, **móvil y escritorio**: con el CSS completo y con las hojas bloqueadas (solo el crítico). Falla si difiere el **estilo computado** de algún elemento (y de sus `::before`/`::after`), su caja, las `@font-face` que carga el completo y el crítico no declara, o las animaciones que arrancan.
- Falla si queda una **hoja bloqueante en el `<head>`** de la respuesta (así se caza una ruta SSR que pierde su crítico) o si no hay CSS inline.
- Falla si el **CLS** no es 0 cuando el CSS completo llega 1,2 s tarde.
- **Canarios**: el comparador tiene que ver la diferencia entre la página con CSS y sin CSS, entre claro y oscuro, y entre móvil y escritorio. Si no la ve, sale con 2 («el fallo es del control») en vez de dar verde.

Regla general para el contenido que crea JS al hidratar (formularios, islas `client:only`, el banner de cookies cuando se monta en cliente): los scripts externos se **bloquean** en las dos cargas, así que el DOM comparado es el que entrega el servidor. Los scripts inline (`ApplyColorMode`) corren. Ese contenido solo se estila al llegar el CSS completo; es el límite del enfoque, no se lista por ruta.

Depurar una página: `CRITICAL_CSS_CHECK_ONLY=/about/ node scripts/critical-css-check.mjs`.

### Prueba de mutación (cómo se sabe que el control muerde)

Reintroducir cada fallo conocido y comprobar que el control se pone rojo; está pegada en el PR que lo introdujo. Los mutantes son ediciones del fuente + rebuild, no hooks en el código de producción.

## Límites reales

- Contenido creado por JS: sin estilos hasta que llega el CSS completo (≈2-3 s en Slow 4G).
- `:hover`, `:focus`, estados de interacción: no son primer pintado y el control no los mira.
- Navegación con `ClientRouter`: lo cubre el CSS completo (ya en caché); no se compara.
- Un descendiente solo-SSR sin binding `ASSETS` no tiene crítico y el control lo dice.

## Cómo se apaga

Quitar `criticalCss()` de `integrations` en `astro.config.mjs` (y regenerar el contrato). Vuelve el `<link>` bloqueante. El control `critical-css-check` hay que quitarlo del `studio:check` también.
