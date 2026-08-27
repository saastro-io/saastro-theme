# src — el template del que nacen los sites

> **Esta ficha es CONTRATO.** La leen agentes de otros repos —los nueve sites
> de ENLOLAB, y quien monte uno nuevo— antes de derivar o retocar nada. Si
> cambia el contrato Studio o el pipeline, cambia esta ficha en el mismo
> commit.

## Qué es

saastro-theme es la **plantilla base Studio-ready**: Astro + Cloudflare, con
la instrumentación que el Studio del hub necesita para editar visualmente
(`studio-contract.json` verificado sobre el DOM construido — el check corre
en build, no es documentación).

## Lo que se promete

- **El contrato Studio se cumple en el DOM construido**: `data-*` de
  instrumentación en las piezas editables. Romperlo rompe la edición visual
  de TODOS los sites derivados.
- **Las primitivas no se editan a mano**: se BAJAN del registry de ui con
  `pnpm ui:check` / `pnpm ui:sync` (modelo copy-in, base `base-nova` — Base
  UI, no Radix). Una primitiva tocada localmente se pierde en el siguiente
  sync.
- **Los formularios son de @saastro/forms** y las landings (`/lp/<slug>`)
  van respaldadas por colección — el contenido de campaña se edita, no se
  programa.

## Cómo nace un site

El pipeline completo (briefing → Design handoff → template → live) está en
el CLAUDE.md del repo, paso a paso, con los gotchas de SEO/Studio aprendidos
en yogui-bebes. Un site derivado hereda este contrato entero.
