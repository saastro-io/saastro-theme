---
name: apply-handoff
description: Aplica un handoff de Claude Design a este site (descendiente de saastro-theme) y itera hasta que `pnpm studio:check` esté verde. Úsala cuando llegue un diseño de Claude Design — un `.dc.html`, un bundle de handoff, o un import por el MCP claude_design — y haya que convertirlo en secciones instrumentadas para Studio. También cuando el usuario diga "aplica este diseño", "porta el handoff" o "mete el diseño en el site".
---

# Aplicar un handoff de Claude Design

Portas un diseño a este site y **no paras hasta que el gate esté verde**. El diseño manda
en lo visual; el repo manda en lo técnico. No necesitas criterio propio sobre qué es
seguro tocar: **el checker te lo dice**.

## La frontera (lo único que hace falta memorizar)

| Zona libre — reescribe a gusto | Arquitectura — no la inventes |
|---|---|
| Tokens en `src/styles/global.css` (oklch) | Los marcadores `data-saastro` (los inyecta el plugin) |
| Copy en `src/i18n/translations/*.json` | La forma del i18n que declara `saastrocms.config.ts` |
| Composición de páginas y bloques presentacionales | El cableado de Nav/Footer/widgets (menú móvil, selector de idioma, reabrir cookies, contact sheet) |
| Adapters `src/components/blocks/*.astro` | `HubForm` como único camino de formularios |

Si el diseño pide una sección que no existe, **se construye aquí como bloque + adapter**
— nunca markup suelto dentro de una página.

## El bucle

1. **Lee el playbook completo primero**: `docs/claude-design-handoff.md`. Es la guía
   canónica (regla de oro: **portar, nunca pegar**; el patrón Bloque → Adapter →
   Contenido; qué NO regenerar). Este skill lo ejecuta, no lo sustituye.
2. **Fotografía el punto de partida**: `pnpm studio:check` antes de tocar nada. Si ya
   estaba rojo, anota qué fallaba — eso es deuda previa, no la mezcles con tu trabajo
   ni la tapes.
3. **Porta sección a sección** (no todo de golpe): bloque presentacional → adapter con
   `data-saastro` → copy a los JSON de **todos** los locales del site → tokens.
4. **Corre el gate**: `pnpm studio:check`. Cada fallo dice invariante, página/campo, y
   el remedio. Arregla y repite.
5. **Verde = terminado**. Rama → PR. Si el site ya está conectado al Hub, `git pull`
   antes de re-portar: el copy vivo lo posee el cliente.

## Leer los fallos del gate

| Fallo | Qué significa casi siempre |
|---|---|
| `missing_marker` / sección sin marcador | La raíz del componente va en PascalCase o perdió el `fieldPrefix`: el plugin no pudo inyectar. Raíz en tag HTML minúscula |
| `verbatim` | El texto i18n no llega intacto al DOM (lo transformas con trim/concat/uppercase, o dejaste de renderizarlo). Sin verbatim no hay click-to-edit |
| `hardcoded_hex` / `css-tokens` | Color a pelo o token de fuente roto: todo color es variable oklch en `global.css` |
| `i18n_parity` | Una hoja existe en un locale y no en otro |
| `cookie-policy` | El banner enlaza a una política que no existe: crea la página o corrige el href |
| `architecture` | Tocaste un fichero de arquitectura. Si fue deliberado y consciente: `pnpm studio:contract:update` y commitea el diff — **nunca a ciegas para "poner el check en verde"** |

## Reglas que no se negocian

- **Nunca pegues el `.dc.html`** en `src/` ni en el Hub: es referencia visual.
- **Nunca regeneres Nav/Footer** desde el diseño: llevan comportamiento. Coge el look,
  conserva el cableado.
- **Nunca hardcodees copy ni color**: van a i18n y a tokens, o el cliente no podrá
  editarlos y el gate lo cazará.
- **Nunca vuelvas a Claude Design a arreglar código**: los arreglos son aquí.
- **`studio:contract:update` no es un botón de silenciar.** Solo tras un cambio
  estructural deliberado, y el diff se revisa.
- **Locales**: usa los que declare `src/i18n/config.ts` de ESTE site (el scaffold los
  parametriza — puede ser solo `es`). No asumas EN/ES.

## Cuando el gate no se pone verde

No lo rodees. Si un fallo no lo entiendes, para y explica al usuario qué invariante
falla, en qué página y qué has intentado. Un check en verde falseado (marcador puesto a
mano donde el plugin debía inyectarlo, contrato regenerado para tapar un fallo real)
es peor que un check en rojo honesto: el rojo se arregla, el verde falso llega al
cliente.
