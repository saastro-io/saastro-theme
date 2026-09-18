# Propagar una mejora del theme a un site nacido de plantilla

Medido el 18-sep-2026 sobre un clon local de `enlolab/dorjoiers` en `/tmp`,
contra `saastro-theme` en `376333a`. Nada de lo que hay aquí se afirma sin el
comando y su salida; lo que no se ejecutó está marcado **No comprobado**.

## El problema, en una orden

De los once sites, solo tres (`esosique`, `hospitalitop`, `pinteach-web`)
comparten la raíz git del theme. Los otros ocho tienen raíz propia. El
mecanismo que la aplastó —«New site from template» del Hub, según midió
`jefe-sites`— aquí no se ha comprobado; lo que sí se mide es la consecuencia,
y basta: para esos ocho la receta que promete la skill `site-saastro` es
**inejecutable**:

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
`checkout <ref> -- <ruta>` necesitan merge-base. Pero no hacen lo mismo:
`cherry-pick` aplica un parche a tres bandas, `checkout <ref> -- <ruta>`
**copia el blob encima**. De ahí que la segunda no dé conflictos nunca — y de
ahí también que pueda pisar en silencio lo que el site había adaptado.

```console
$ git fetch git@github.com:saastro-io/saastro-theme.git main
real 2.4s
$ git rev-parse FETCH_HEAD
376333a284c7be6bd841801afdbd6006330514a2
```

A partir de ahí hay dos formas, y **no son intercambiables**.

### (b1) `git checkout FETCH_HEAD -- <ruta>` — solo para ficheros SIN adaptar

Trae el estado de HEAD, no el de un commit suelto. Vale **únicamente** para
rutas que el site no ha tocado y que no estén hasheadas en su manifiesto.
Las dos condiciones se comprueban antes, y están más abajo; el caso feliz
primero.

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
defecto **cuando se cumplen las dos condiciones de abajo**.

#### El límite de (b1): probé el caso feliz, y no todos lo son

`cabeceras-check.mjs` era fichero nuevo, sin adaptar y fuera del manifiesto.
No todos los `scripts/*.mjs` lo son. El manifiesto del **site** (no el del
theme: el que se pone rojo es el suyo) hashea catorce rutas de arquitectura:

```console
$ python3 -c "import json;print(list(json.load(open('studio-contract.json'))['architectureHashes']))"
['astro.config.mjs', 'saastrocms.config.ts', 'scripts/studio-check.mjs',
 'scripts/studio-contract-check.mjs', 'src/content.config.ts', 'src/env.d.ts',
 'src/i18n/…', 'src/integrations/strip-studio-meta-middleware.ts',
 'src/lib/settings.ts', 'src/middleware.ts']
```

Y cuatro de ellas —`scripts/studio-check.mjs`,
`scripts/studio-contract-check.mjs`, `src/lib/settings.ts`,
`src/middleware.ts`— **difieren** entre theme y site. Aplicarles (b1) rompe
el site sin avisar en el momento:

```console
$ git checkout FETCH_HEAD -- scripts/studio-check.mjs
$ python3 -c "…sha256 del fichero vs el del manifiesto…"
manifiesto: sha256:274fbd06aebed988632446aa1d02f7f529d249e41b8d217e94ee0b8986dac880
tras b1   : sha256:0ce75f4f0e28098423c8b907a76c44d0fd74dc192beccbdeed990415b2202b38
ROJO: el contract-check del site fallaría
```

(Revertido; el clon quedó limpio.) Antes de cada (b1), dos comprobaciones:

```bash
diff -q <ruta> <(git show FETCH_HEAD:<ruta>)    # si difiere, el site lo adaptó → (b2)
python3 -c "import json,sys;print('<ruta>' in json.load(open('studio-contract.json'))['architectureHashes'])"
```

Si la ruta está hasheada y aun así hay que propagarla, el cambio lleva detrás
`pnpm studio:contract:update` y el manifiesto commiteado en el mismo PR. Nunca
un (b1) suelto.

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
versión **caducada**. O se propaga el rango entero (`git log --oneline --
<ruta>` dice cuál es), o —si la ruta cumple las dos condiciones de (b1)— se
usa (b1), que por construcción trae HEAD.

## (a) Empaquetar el theme en npm: medido y desaconsejado

No se publicó nada (publicar es de JC). Lo que se midió es **cuánto
compartirían de verdad** theme y site, que es lo que decide si hay paquete.

**Sobre el método**, porque la primera cuenta de este doc estaba mal y el
revisor la cazó: `diff -rq` **no desciende a un directorio que falta en un
lado** — lo cuenta como una línea aunque lleve siete ficheros dentro. Sus
cifras subestiman. El censo de abajo recorre los dos árboles con `os.walk`
excluyendo `node_modules`, `.git`, `dist`, `.astro` y `.claude`, y compara
byte a byte con `filecmp.cmp(shallow=False)`:

El script va commiteado en `docs/census-theme-site.py`, para que el número sea
reproducible y no haya que creerme:

```console
$ python3 docs/census-theme-site.py . /tmp/office-9w3rpy/dorjoiers
ficheros theme : 195
ficheros site  : 188
en ambos       : 95
  identicos    : 23
  difieren     : 72
solo en theme  : 100
solo en site   : 93
```

**23 de 195.** Ese número no se movió al corregir el método, que es lo que
decide el veredicto. Y de esos 23:

- cinco son **marca** (`logo-light.svg`, `logo-dark.svg`, los tres favicons)
  que *deberían* diferir: el site está en producción con los assets de la
  plantilla. Eso es un hallazgo del site, no superficie compartible.
- dos son `.envrc` y `.npmrc`, dos más son `.vscode/`.
- uno, `scripts/cabeceras-check.mjs`, **sale idéntico porque lo propagué yo**
  en la vía (b1) unas líneas más arriba. Antes del encargo no estaba.

Queda un núcleo genuinamente compartible de **trece ficheros**:
`src/lib/{utils,cookies,reading-time,debug-shim}.ts`,
`src/widgets/ContactSheet/{ContactSheetButton.tsx,index.ts,store.ts}`,
cuatro `.astro` de terceros (`OgImage`, `AnalyticsNoscript`, `ToggleTheme`,
`GenTracking`) y `src/components/ui/{utils.ts,textarea.tsx}`.

El theme es `"private": true` y `"name": "saastro-theme"`: es una aplicación
Astro, no una librería. Un paquete npm exigiría extraer esos trece ficheros a
un paquete nuevo, publicarlo con la YubiKey de JC, y pagar en cada uno de los
once sites el peaje del 0.x (el caret no cruza el minor: bump explícito +
redeploy). A cambio **no cubriría** donde vive la divergencia real: los 72
ficheros que difieren, casi todos secciones de `src/components`, `src/pages`,
`src/i18n` y el propio `studio-contract.json`.

Las primitivas —el otro candidato obvio— **ya tienen su canal**: el registry de
`saastro-ui` con `ui:check`/`ui:sync`. dorjoiers ni siquiera trae esos dos
scripts.

**Veredicto: no compensa.** La comparación no está reñida: (b1) cuesta 0.011 s
y cero peajes; (a) cuesta una publicación, un breaking change potencial y once
bumps, para trece ficheros.

## Procedimiento recomendado para los ocho de plantilla

```bash
# 1. ¿descendiente o de plantilla? La raíz manda.
git rev-list --max-parents=0 HEAD     # 6a69f05… ⇒ descendiente: usa git merge upstream/main

# 2. de plantilla: traer el theme sin historia común
git fetch git@github.com:saastro-io/saastro-theme.git main

# 3. ¿el site adaptó esa ruta? ¿está hasheada en SU studio-contract.json?
diff -q <ruta> <(git show FETCH_HEAD:<ruta>)
python3 -c "import json;print('<ruta>' in json.load(open('studio-contract.json'))['architectureHashes'])"

# 3a. NO adaptada y NO hasheada → copia del blob, sin conflictos
git checkout FETCH_HEAD -- scripts/cabeceras-check.mjs

# 3b. adaptada (package.json, secciones) → el commit, con trazabilidad
git cherry-pick -x <sha>              # espera conflictos de contexto, no del cambio

# 3c. hasheada → lo que toque + pnpm studio:contract:update, manifiesto en el mismo PR

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
- El censo de arriba se tomó sobre el clon **después** de las pruebas, así que
  lleva dentro el `scripts/cabeceras-check.mjs` que propagué yo. Está descontado
  a mano en el recuento de los trece, no en las cifras brutas del censo.
  El clon de `/tmp` no es un estado limpio de dorjoiers: es dorjoiers más este
  encargo.

## Propuesta para `site-saastro/SKILL.md` (no aplicada)

La skill vive en `saastro-claude`, que no es de este dominio: aquí solo se
propone el texto. **Este parche no está contado a mano**: se generó aplicando
los cambios a una copia y sacando `diff -u`, y se verificó contra el fichero
real (la primera versión de este doc llevaba las cabeceras `@@` mal, y por eso
no habría aplicado):

```console
$ cd ~/SAASTRO/saastro-claude && git apply --check -p1 proposed.patch
exit=0
```

Tres puntos, no uno: la cabecera afirma que todos los sites son descendientes;
«Anatomía» enumeraba **ocho** sites cuando son once (faltaban `dorjoiers`,
`hospitalitop` y `zamesegur`, precisamente los que el párrafo nuevo nombra); y
la orden de la línea 34 no existe en 8 de 11.

```diff
--- a/plugins/saastro-ecosystem/skills/site-saastro/SKILL.md
+++ b/plugins/saastro-ecosystem/skills/site-saastro/SKILL.md
@@ -6,11 +6,16 @@
 
 # Un site SAASTRO
 
-Todo site cliente es un **descendiente git de `saastro-theme`** con historia
-completa y consumidor de `@saastro/forms` desde npm. Su contenido se edita en
-el **hub**; sus leads viven en **gen**; su código es de `jefe-sites`; su
-negocio, del dominio al que sirve. Fuente: `ecosistema/72-CLIENTES.md`,
-`~/ENLOLAB/SITES/CLAUDE.md`, el `CLAUDE.md` de cada site.
+Todo site cliente nace de `saastro-theme`, pero **de dos maneras que no se
+propagan igual**. Tres son descendientes git con historia completa
+(`esosique`, `hospitalitop`, `pinteach-web`); los otros ocho
+(`antenna-consulting`, `dorjoiers`, `enlolab-site`, `jcenlo-site`, `nopagues`,
+`saastro-site`, `yogui-bebes`, `zamesegur`) tienen raíz git propia y ninguna
+historia en común con el theme. Todos consumen `@saastro/forms` desde npm. Su
+contenido se edita en el **hub**; sus leads viven en **gen**; su código es de
+`jefe-sites`; su negocio, del dominio al que sirve. Fuente:
+`ecosistema/72-CLIENTES.md`, `~/ENLOLAB/SITES/CLAUDE.md`, el `CLAUDE.md` de
+cada site.
 
 ## Anatomía
 
@@ -24,17 +29,46 @@
 
 Los sites propios (enlolab-site, jcenlo-site, saastro-site) cuelgan de
 `~/ENLOLAB/Jcenlo/`; los sueltos (antenna-consulting, esosique, nopagues,
-yogui-bebes) de `~/ENLOLAB/`; `pinteach-web` de `~/SAASTRO/`. La cabina
+yogui-bebes) de `~/ENLOLAB/`; los de cliente con cabina propia (dorjoiers,
+hospitalitop, zamesegur) de `~/ENLOLAB/<Cliente>/`; `pinteach-web` de
+`~/SAASTRO/`. Son once. La cabina
 `~/ENLOLAB/SITES/` los agrupa por symlink para VS Code: **no es un repo git**
 y los encargados no arrancan ahí.
 
 ## Traer las mejoras del theme
 
+**Primero, mira la raíz.** Es lo que decide la vía, y no se supone:
+
 ```
+git rev-list --max-parents=0 HEAD
+# 6a69f051d653f3bb18b31d49f5005abba9d21607 → descendiente
+# cualquier otra                           → raíz propia
+```
+
+Descendiente (3 de 11):
+
+```
 git fetch upstream && git merge upstream/main
 pnpm studio:check          # valida el contrato del Studio después de cada merge
 ```
 
+Raíz propia (8 de 11). Ahí `git merge` responde «refusing to merge unrelated
+histories» y la orden de arriba **no existe**:
+
+```
+git fetch git@github.com:saastro-io/saastro-theme.git main
+# la ruta NO adaptada por el site y NO hasheada en su studio-contract.json:
+git checkout FETCH_HEAD -- scripts/<fichero>
+# la ruta que el site adaptó: el commit, con trazabilidad y conflictos de contexto
+git cherry-pick -x <sha>
+pnpm studio:check
+```
+
+Comprobar esas dos condiciones **antes** de cada `checkout ... -- <ruta>`: copia
+el blob encima, no fusiona, y por eso no da conflictos nunca. El procedimiento
+completo, con el coste medido de cada vía y por qué empaquetar el theme en npm
+no compensa, en `saastro-theme/docs/propagacion-sites-plantilla.md`.
+
 El remoto `upstream` apunta a `saastro-io/saastro-theme`. Un fallo que
 tienen todos los sites se arregla en el theme (encargo a
 `code:saastro-theme`, dominio saastro), nunca con siete parches. Un hallazgo
```

El reparto 3/8 —y con él la lista de ocho nombres del parche— lo midió
`jefe-sites`; aquí se verificaron dos casos (`dorjoiers` raíz propia,
`esosique` descendiente). Quien aplique el parche debería confirmar los nueve
restantes con el comando de la raíz: cuesta un clon sin blobs por site.
