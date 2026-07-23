# Pipeline de proyecto nuevo — de briefing a site vivo

> **Para qué**: montar un site de cliente desde cero, con el diseño hecho en Claude
> Design, garantizando que Studio funciona al final. Si buscas el detalle de cómo
> portar un diseño, eso es `claude-design-handoff.md`; esto es el mapa.

La idea de fondo: **el repo vigila la arquitectura, tú vigilas lo visual**. Antes había
que revisar cada diff con lupa porque un rediseño podía romper Studio en silencio.
Ahora el contrato es ejecutable, así que el trabajo pasa a ser "aplicar y mirar que el
check esté verde".

## Las cuatro etapas

### 1. Crear el repo del cliente — un comando

Desde el repo del Hub (`~/SAASTRO/saastro-hub`):

```bash
pnpm scaffold client clinica-luz \
  --name "Clínica Luz" --domain clinicaluz.es --owner enlolab \
  --locales es --default es --collections legal
```

Qué hace: clona este theme **con la historia completa** y deja el remote `upstream`
apuntando a él, parametriza identidad (package.json, wrangler, settings, manifest PWA,
docs), locales (i18n config + JSONs + tipos), colecciones (poda incluida) y dominio,
regenera el contrato, y **solo commitea si `studio:check` sale verde** — si no, falla
con el informe y deja el repo en disco para inspección.

Colecciones del theme: `blog`, `legal` (no podable) y `landings` (páginas de
campaña en `/lp/<slug>`, SSR — ver la sección *Landings* del CLAUDE.md). El
scaffold poda por anclas textuales sobre `src/content.config.ts` y
`saastrocms.config.ts`: si tocas esos bloques en el theme, actualiza el
scaffold en la misma ventana (lockstep).

Flags útiles: `--no-git-push` (solo local, sin crear repo remoto), `--dir <path>`,
`--schema-type`, `--description`.

**Por qué con historia completa y no con "Use this template"**: un repo creado con
*Use this template* no comparte historia con el theme, así que **nunca** podrá
`git merge upstream/main` — cada arreglo del theme habría que back-portarlo a mano.
Con el scaffold, traerse mejoras es:

```bash
git fetch upstream && git merge upstream/main
```

Lo que el comando **no** puede saber, y queda como onboarding (lo lista
`saastro.template.json` → `onboardingTasks`): favicon y OG reales, `SITE_URL` en el
dashboard de Cloudflare, LocalBusiness si es negocio local, contenido legal, tokens de
marca, y conectar el site en el Hub.

### 2. Diseñar — Claude.ai → Claude Design

El briefing y la dirección viven arriba (conversación en Claude.ai), el diseño se hace
en Claude Design, y de ahí sale el handoff: un `.dc.html`, un bundle, o el import por
el MCP `claude_design`.

Una vez: alinea el design-system de Claude Design con este theme (o con el registry
`saastro-ui`) — `/design-sync` — para que cada diseño nazca con los tokens correctos.

### 3. Aplicar el handoff — el bucle

En el repo del cliente, con Claude Code: invoca la skill **`apply-handoff`** (vive en
`.claude/skills/`, así que toda copia la hereda al clonarse). El bucle es:

```
portar sección → pnpm studio:check → arreglar lo rojo → repetir → verde
```

El agente no necesita criterio sobre qué es seguro tocar: el checker se lo dice. La
frontera está en la skill; el detalle de cómo portar, en `claude-design-handoff.md`.

**El paso manual es deliberado**: el handoff pasa por tu máquina y tú revisas lo
visual. Lo que ya no haces es vigilar la arquitectura a ojo.

### 4. Publicar

Rama → PR → deploy → en el Hub, **"Connect existing"**. El gate corre el mismo
validador que el Setup doctor del Hub, así que **verde aquí ⇒ verde allí**. A partir de
ese momento el copy lo posee el cliente: antes de re-portar un diseño nuevo, `git pull`.

## Qué te protege, y de qué

Las tres capas que hacen que esto sea repetible (y por qué existen):

1. **El sistema falla ruidoso**: raíz en PascalCase → el build revienta; binding dudoso
   → Studio se niega a escribir en vez de corromper la página; entrada que no valida el
   schema → 422 en el Hub. Antes todo eso fallaba en silencio.
2. **Poca maquinaria en lo que se rediseña**: los marcadores los inyecta el plugin, las
   islas usan primitivas. Cuando Design reescribe un Hero, en ese fichero casi no queda
   nada arquitectónico que romper.
3. **El contrato ejecutable** (`pnpm studio:check` = doctor + build + contract-check
   sobre el DOM construido o servido): marcadores, texto verbatim, paridad i18n,
   tokens, política de cookies alcanzable, **beacon de Gen declarado en la política**
   (`gen-legal`), arquitectura sin divergir. Viaja dentro del repo, así que **toda
   copia lo hereda**.

## Errores caros que ya nos costaron caro

- **"Use this template"** → repo huérfano, sin merges de upstream. Usa el scaffold.
- **Regenerar Nav/Footer desde el diseño** → pierdes el cableado (menú móvil, selector
  de idioma, reabrir cookies). Coge el look, conserva la lógica.
- **`studio:contract:update` para poner el check en verde** → estás borrando la alarma,
  no el fuego. Solo tras un cambio estructural deliberado, revisando el diff.
- **Copy o color hardcodeados** → el cliente no puede editarlos desde Studio.
- **Fuentes de terceros sin declarar** → los sites cargan Google Fonts desde el CDN de Google (decisión del propietario, 16-jul-2026: no se autoaloja). Eso es una decisión tomada, no un despiste — pero **obliga**: la política de cookies/privacidad del site tiene que declarar esa transferencia, porque el navegador del visitante manda su IP a Google en cada carga, antes de que el banner exista. Lo que no se puede es cargarla sin declararla.
- **Encender Gen y no tocar el texto legal** → `settings.gen.workspaceId` añade un
  tratamiento (vista de página a `gen.saastro.io` + visitor id que viaja en cada
  formulario) mientras la política sigue diciendo que no hay seguimiento. Misma clase
  que las fuentes: el fallo no está en el código, está en que el texto no lo sigue. El
  invariante `gen-legal` lo impide; el texto listo para copiar está en
  **`docs/legal-gen-tracking.md`**.
- **Editable fuera del allowlist del Hub** (i18n JSON · `.md` · `src/pages` ·
  `src/content` · `studio.config.json`) → se pierde en la siguiente publicación.
