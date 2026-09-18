# Propagar una mejora del theme a un site nacido de plantilla

Medido el 18-sep-2026 sobre un clon local de `enlolab/dorjoiers` en `/tmp`,
contra `saastro-theme` en `376333a`. Nada de lo que hay aquí se afirma sin el
comando y su salida; lo que no se ejecutó está marcado **No comprobado**.

## El problema, en una orden

De los once sites, solo tres (`esosique`, `hospitalitop`, `pinteach-web`)
comparten la raíz git del theme. Los otros ocho nacieron de «New site from
template» del Hub, que aplasta la historia. Para ellos la receta que promete
la skill `site-saastro` es **inejecutable**:

```console
$ git merge FETCH_HEAD
fatal: refusing to merge unrelated histories
```

## El diagnóstico barato: la raíz, no el merge-base

No hace falta clonar entero ni intentar un merge. El **commit raíz** basta y
se saca de un clon sin blobs:

```console
$ git clone --quiet --filter=blob:none --no-checkout git@github.com:enlolab/esosique.git /tmp/probe
$ git -C /tmp/probe rev-list --max-parents=0 HEAD
6a69f051d653f3bb18b31d49f5005abba9d21607     ← la raíz del theme: DESCENDIENTE

$ git -C /tmp/dorjoiers rev-list --max-parents=0 HEAD
5433acd691b6a95878a2be63db450d69fbd4f4fa     ← raíz propia: DE PLANTILLA
```

La raíz del theme es `6a69f05`. Confirmación cruzada en esosique:
`git merge-base FETCH_HEAD HEAD` → `8a18c30`, exit 0. En dorjoiers, exit 1 y
salida vacía.

## Lo que sí funciona: `fetch` de la URL + propagación por ruta

`git fetch` **no necesita historia común**, y ni `cherry-pick` ni
`checkout <ref> -- <ruta>` necesitan merge-base: ambos son aplicación de
parche a tres bandas, no un merge de ramas.

```console
$ git fetch git@github.com:saastro-io/saastro-theme.git main
real 2.4s
$ git rev-parse FETCH_HEAD
376333a284c7be6bd841801afdbd6006330514a2
```

A partir de ahí hay dos formas, y **no son intercambiables**.

### (b1) `git checkout FETCH_HEAD -- <ruta>` — para ficheros de INFRA

Ficheros que deben ser idénticos en todos los sites: `scripts/*.mjs`,
`src/lib/` genérico. Trae el estado de HEAD, no el de un commit suelto.

```console
$ time git checkout FETCH_HEAD -- scripts/cabeceras-check.mjs
real 0.011s
$ diff -q scripts/cabeceras-check.mjs <theme>/scripts/cabeceras-check.mjs
(idéntico)
$ node scripts/cabeceras-check.mjs
✓ cabeceras-check — las dos listas cuadran (5 cabeceras).
```

Control negativo, porque un control que solo se ha visto pasar no se ha
comprobado — reintroduciendo `X-XSS-Protection` en `public/_headers` del site:

```console
$ node scripts/cabeceras-check.mjs
✖ cabeceras-check — las dos listas de cabeceras NO dicen lo mismo.
  solo en public/_headers: x-xss-protection
```

**Coste: 0.011 s, cero conflictos, cero resolución manual.** Es la vía por
defecto.

### (b2) `git cherry-pick -x <sha>` — para ficheros que el site ADAPTÓ

Propagando `ff3a5da` («Las dos listas de cabeceras…») a dorjoiers:

```console
$ time git cherry-pick -x ff3a5da
Auto-merging package.json
CONFLICT (content): Merge conflict in package.json
Auto-merging public/_headers
CONFLICT (content): Merge conflict in public/_headers
A  scripts/cabeceras-check.mjs
real 0.145s
```

Funciona —el fichero nuevo entra limpio— pero los dos conflictos **no son del
cambio**: son de la divergencia acumulada del site. El commit original tocaba
**una línea** en cada fichero; el 3-way conflictó por el contexto:

- `package.json`: el site tiene otro pipeline entero (`dist/_worker.js` vs
  `dist/server`, `pnpm run build` vs `astro build`, y scripts que el theme no
  tiene). El cambio real era añadir `cabeceras-check.mjs` delante de
  `studio:check`; se aplica a mano en un `sed`.
- `public/_headers`: **conflicto nulo**. dorjoiers ya había quitado
  `X-XSS-Protection` por su cuenta. Nada que aplicar.

Resuelto y continuado, el commit aterriza con su trazabilidad:

```console
$ git log -1 --stat
582de2b Las dos listas de cabeceras, a la par, y un control que lo vigila (#63)
    (cherry picked from commit ff3a5da69e879c27e9bf54b0b8a6146f3cc6263b)
 package.json                |  2 +-
 scripts/cabeceras-check.mjs | 92 +++++++++++
```

Ese trailer `(cherry picked from commit …)` es lo que vale de esta vía: la
siguiente propagación puede **medir** qué se llevó ya, cosa que un
`diff | patch` no deja.

**Coste: 0.145 s de máquina + resolución humana de 2 conflictos, de los
cuales 1 era nulo.**

### La trampa de (b2): un commit no es el estado del fichero

Tras el cherry-pick de `ff3a5da`, el fichero propagado **no coincidía** con el
theme:

```console
$ diff <theme>/scripts/cabeceras-check.mjs scripts/cabeceras-check.mjs
64c64  <  for (const [lado, set, ruta] of …
       >  for (const [nombre, set, ruta] of …
$ git log --oneline -- scripts/cabeceras-check.mjs
888c21f Revisión de base sobre #63 …
ff3a5da Las dos listas de cabeceras …
```

`888c21f` lo refinó después. Cherry-pick de un commit suelto propaga una
versión **caducada**. O se propaga el rango entero, o —para infra— se usa
(b1), que por construcción trae HEAD.

## (a) Empaquetar el theme en npm: medido y desaconsejado

No se publicó nada (publicar es de JC). Lo que se midió es **cuánto
compartirían de verdad** theme y site, que es lo que decide si hay paquete:

```console
$ diff -rq --exclude=node_modules --exclude=.git --exclude=dist --exclude=.astro <theme> <site>
difieren:      73 ficheros
solo en theme: 65
solo en site:  60
```

De los 177 ficheros del theme, **23 son byte a byte idénticos** al site
(`cmp -s` uno a uno). Y de esos 23, cinco son marca (`logo-light.svg`,
favicons) que *deberían* diferir y no difieren, y dos son `.envrc`/`.npmrc`.
El núcleo genuinamente compartible son unos **quince ficheros**:
`src/lib/{utils,cookies,reading-time,debug-shim}.ts`,
`src/widgets/ContactSheet/*`, cuatro `.astro` de terceros
(`OgImage`, `AnalyticsNoscript`, `ToggleTheme`, `GenTracking`),
`src/components/ui/{utils.ts,textarea.tsx}` y `scripts/cabeceras-check.mjs`.

El theme es `"private": true` y `"name": "saastro-theme"`: es una aplicación
Astro, no una librería. Un paquete npm exigiría extraer esos quince ficheros a
un paquete nuevo, publicarlo con la YubiKey de JC, y pagar en cada uno de los
once sites el peaje del 0.x (el caret no cruza el minor: bump explícito +
redeploy). A cambio **no cubriría** dónde vive la divergencia real: las 23
secciones de `src/components`, `src/pages`, `src/i18n` y `studio-contract.json`.

Las primitivas —el otro candidato obvio— **ya tienen su canal**: el registry de
`saastro-ui` con `ui:check`/`ui:sync`. dorjoiers ni siquiera trae esos dos
scripts.

**Veredicto: no compensa.** La comparación no está reñida: (b1) cuesta 0.011 s
y cero peajes; (a) cuesta una publicación, un breaking change potencial y once
bumps, para quince ficheros.

## Procedimiento recomendado para los ocho de plantilla

```bash
# 1. ¿descendiente o de plantilla? La raíz manda.
git rev-list --max-parents=0 HEAD     # 6a69f05… ⇒ descendiente: usa git merge upstream/main

# 2. de plantilla: traer el theme sin historia común
git fetch git@github.com:saastro-io/saastro-theme.git main

# 3a. INFRA (scripts/, src/lib genérico): estado de HEAD, sin conflictos
git checkout FETCH_HEAD -- scripts/cabeceras-check.mjs

# 3b. ADAPTADO (package.json, secciones): el commit, con trazabilidad
git cherry-pick -x <sha>              # espera conflictos de contexto, no del cambio

# 4. medir, siempre
pnpm studio:check
```

## No comprobado

- `pnpm studio:check` completo en el clon de dorjoiers: no se instalaron
  dependencias. Solo se ejecutó `scripts/cabeceras-check.mjs`, que es node puro.
- La raíz git de los otros nueve sites. Medidas aquí: `dorjoiers` (`5433acd`,
  de plantilla) y `esosique` (`6a69f05`, descendiente). El reparto 3/8 viene de
  la medición de `jefe-sites`, no de esta.
- Si el plugin `autoWrap` de `@saastro/studio` sabría inyectar marcadores sobre
  `.astro` servidos desde `node_modules`. Es la pregunta que decidiría una vía
  (a) ampliada a secciones, y no se ha medido.

## Propuesta para `site-saastro/SKILL.md` (no aplicada)

La skill vive en `saastro-claude`, que no es de este dominio: aquí solo se
propone el texto. Dos puntos mienten hoy, no uno.

```diff
@@ -9,4 +9,10 @@
-Todo site cliente es un **descendiente git de `saastro-theme`** con historia
-completa y consumidor de `@saastro/forms` desde npm. Su contenido se edita en
-el **hub**; sus leads viven en **gen**; su código es de `jefe-sites`; su
-negocio, del dominio al que sirve. Fuente: `ecosistema/72-CLIENTES.md`,
-`~/ENLOLAB/SITES/CLAUDE.md`, el `CLAUDE.md` de cada site.
+Todo site cliente nace de `saastro-theme`, pero **de dos maneras que no se
+propagan igual**. Tres son descendientes git con historia completa
+(`esosique`, `hospitalitop`, `pinteach-web`); los otros ocho
+(`antenna-consulting`, `dorjoiers`, `enlolab-site`, `jcenlo-site`, `nopagues`,
+`saastro-site`, `yogui-bebes`, `zamesegur`) nacieron de «New site from
+template» del Hub, que aplasta la historia: no tienen raíz común. Todos
+consumen `@saastro/forms` desde npm. Su contenido se edita en el **hub**; sus
+leads viven en **gen**; su código es de `jefe-sites`; su negocio, del dominio
+al que sirve. Fuente: `ecosistema/72-CLIENTES.md`, `~/ENLOLAB/SITES/CLAUDE.md`,
+el `CLAUDE.md` de cada site.

@@ -31,11 +31,26 @@
 ## Traer las mejoras del theme

+**Primero: mira la raíz.** Es lo que decide la vía, y no se supone.
+
+```
+git rev-list --max-parents=0 HEAD
+# 6a69f051d653f3bb18b31d49f5005abba9d21607 → descendiente
+# cualquier otra                           → nació de plantilla
+```
+
+Descendiente (3 de 11):
+
 ```
 git fetch upstream && git merge upstream/main
 pnpm studio:check          # valida el contrato del Studio después de cada merge
 ```
+
+De plantilla (8 de 11) — ahí `git merge` da «refusing to merge unrelated
+histories» y la orden de arriba **no existe**:
+
+```
+git fetch git@github.com:saastro-io/saastro-theme.git main
+git checkout FETCH_HEAD -- scripts/<fichero>   # infra: trae HEAD, sin conflictos
+git cherry-pick -x <sha>                       # adaptado: con trazabilidad y conflictos de contexto
+pnpm studio:check
+```
+
+El procedimiento completo, con coste medido y por qué npm no compensa, en
+`saastro-theme/docs/propagacion-sites-plantilla.md`.

 El remoto `upstream` apunta a `saastro-io/saastro-theme`. Un fallo que
 tienen todos los sites se arregla en el theme (encargo a
```

El reparto 3/8 lo midió `jefe-sites`; aquí se verificaron dos casos
(`dorjoiers` de plantilla, `esosique` descendiente). Antes de aplicar el
diff conviene que quien lo aplique confirme los nueve restantes con el
comando de la raíz, que cuesta un clon sin blobs por site.
