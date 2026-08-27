# docs — los cuatro procedimientos del template

Cuatro documentos, cada uno para un momento distinto. El snapshot lleva sus
encabezados; esto dice cuándo abrir cada uno y qué NO hacer.

- **`claude-design-handoff.md`** — portar un diseño a este template, sección
  por sección. El aviso que más se salta: **nav y footer NO se regeneran**,
  llevan comportamiento (idioma, cookies). Y `src/styles/global.css` es la
  única fuente de los tokens: tocarlos en otro sitio es drift.
- **`pipeline.md`** — el camino de un proyecto nuevo, del briefing a
  producción.
- **`deploy.md`** — cómo se publica (Cloudflare Workers).
- **`legal-gen-tracking.md`** — el tracking legal y su enganche con gen.

El pipeline completo también está resumido en el CLAUDE.md del repo; si los
dos discrepan, manda el documento — el CLAUDE.md es la versión corta.
