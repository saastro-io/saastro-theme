# saastro-theme — Studio-ready base template

This repo is the **canonical base template for new Saastro client sites**: a standalone Astro 6 + React 19 + Tailwind 4 + shadcn/ui marketing site, **pre-instrumented for Saastro Studio** (the editor lives in the Saastro Hub, not in this site).

It is **not** part of the 3-repo `~/SAASTRO` workspace (hub/platform/forms) — it's a separate `saastro-io/saastro-theme` repo, consumed via GitHub *"Use this template"* → Hub *"Connect existing"*.

## Model (why this exists)

- New projects start from this template (GitHub *Use this template*), then connect in the Hub.
- The template already ships everything the Hub's Setup detectors look for, so **the Setup page validates green with zero instrumentation work** (Install Studio / Generate config / Auto-mark find nothing to do). Setup's role becomes validation, not setup.
- The Hub's `@saastro/scaffold` engine is a *separate* path (blank greenfield site from the wizard) — it is **not** this repo.
- `enlolab/dorjoiers` is a production descendant of this theme (its `package.json` is still named `saastro-theme`) — use it as the reference for any Studio-wiring question.

## Studio instrumentation (the contract)

| Piece | File |
|---|---|
| `@saastro/studio` Vite plugin (`autoWrap` + `autoWrapPages`) | `astro.config.mjs` |
| `stripStudioMeta` integration (strips dev meta tags in prod) | `astro.config.mjs` + `src/integrations/strip-studio-meta-middleware.ts` |
| `data-saastro="sec:<key>"` markers on section roots | `src/components/{Hero,AboutContent,Header,Footer}.astro` |
| Global sections (nav/footer) | `studio.config.json` |
| Collections + i18n shape (parsed by the Hub) | `saastrocms.config.ts` (interface inlined — no `@saastro/cms` dep) |
| Editable content | `src/i18n/translations/{en,es}.json` |

**Editable = what's in i18n.** A section is editable when its component emits a `data-saastro="sec:<key>"` marker on its root tag (built from the `fieldPrefix` prop the page/layout passes) AND `<key>` is a top-level namespace in the translation JSON. Marked keys: `hero`, `products`, `about`, `nav`, `footer`. Every section component now follows this contract (prop-driven + i18n + marker) — no hardcoded sections remain.

## UI blocks — `ui.saastro.io` compatibility (the methodology)

`ui.saastro.io` (repo `saastro-ui`) is a **shadcn-style registry** (`@saastro/ui-registry`, ~15 blocks: hero-01/02/03, features-01/02, pricing-01, cta-01, faq-01, testimonials-01, navbar-01, footer-01, blog-grid-01, newsletter-01, stats-01, logos-01). Every block is a **pure presentational React `.tsx`**: typed props, content **only** via props (never hardcoded), `cn` + `@/components/ui/*` + `asChild`. Blocks are served as JSON at `https://ui.saastro.io/r/<name>.json` and pulled with `npx shadcn add @saastro/<block>` (configure the `@saastro` registry in `components.json`; the CLI also pulls each block's `registryDependencies` primitives, filling this theme's primitive set on demand — it ships ~13 of the registry's ~43). This theme already has the matching stack — Tailwind 4 + `cn` (`@/lib/utils`) + `@/*` alias + the shadcn tokens (`--primary`, `--muted-foreground`, …) — so registry blocks drop in unchanged.

**Three layers, strict separation. A component is touched ONLY on a STRUCTURE change, never on a content change:**

1. **Block** — `src/components/ui/blocks/<name>.tsx`, byte-for-byte from the registry. No i18n, no `data-saastro`. Re-run `shadcn add` to upgrade. **Edit only to improve the block upstream in `saastro-ui`** (it then flows back via the registry) — never to change one site's copy.
2. **Adapter** — `src/components/blocks/<Name>.astro`, one per block in use. The only theme-specific glue: wraps the block in `<div data-saastro={`sec:${fieldPrefix}`}>`, maps the i18n object → the block's typed props, and picks hydration (static block = SSR / 0 JS; interactive — accordion / carousel / mobile-nav — = `client:visible`). **"Structure" lives here**: swap blocks or change layout in the adapter, never in the block.
3. **Content** — `src/i18n/translations/{en,es}.json`. Namespace name = section key = `fieldPrefix`. Editing in the Studio moves these values only.

**Invariant:** content-only edit ⇒ only the translation JSON changes (block + adapter untouched; all locales for free). Structural edit (new field, different block, layout) ⇒ the adapter (+ maybe the i18n shape in `saastrocms.config.ts`). The block file never changes from inside this repo.

This is the same `data-saastro` + i18n contract as above — the adapter is just the seam that keeps the registry block pristine while still emitting the section marker the Hub overlay enumerates and binds to the `<fieldPrefix>.<field>` i18n keys. The current sections (`Hero`, `Products`, `AboutContent`, `Header`, `Footer`) all follow the prop-driven + i18n + marker shape; aligning one to a registry block = extract its presentational markup into `blocks/<name>.tsx` and leave a thin adapter behind. (`Products` was the last hardcoded holdout — migrated to the `products` namespace on the home page, in both locales.)

Worked example (faq-01):

```astro
---
// src/components/blocks/Faq.astro — the adapter (the only file we author)
import { Faq01 } from '@/components/ui/blocks/faq-01'   // pristine, from `shadcn add @saastro/faq-01`
const { fieldPrefix = 'faq', title, description, items } = Astro.props
---
<div data-saastro={`sec:${fieldPrefix}`}>
  <Faq01 title={title} description={description} items={items} client:visible />
</div>
```
```astro
---
// src/pages/index.astro — the page only wires i18n → props
const faq = t?.faq ?? { title: 'FAQ', items: [] }
---
<Faq fieldPrefix="faq" title={faq.title} description={faq.description} items={faq.items} />
```

`en.json` → `"faq": { "title": "…", "items": [{ "question": "…", "answer": "…" }] }`. Editing the FAQ in the Studio moves only that JSON; `faq-01.tsx` and `Faq.astro` stay put. Adding a column or switching to `faq-02` = touch the adapter. That is the whole rule.

## i18n routing

Default locale (`en`) renders at the root; non-default (`es`) is prefixed via `src/pages/[locale]/*`. `src/middleware.ts` only resolves the locale into `Astro.locals` (no auth, no stega). The native `i18n` block in `astro.config.mjs` uses `routing: 'manual'` — purely a detection signal; Astro does not own routing here.

## Commands / deploy

- Package manager: **pnpm**. `pnpm dev` (port 4930) · `pnpm build` · `pnpm preview`.
- SSR on Cloudflare Workers (`@astrojs/cloudflare` v13). Deploy via GitHub Actions `.github/workflows/deploy.yml` (`wrangler pages deploy dist/client`).

## History

Migrated from `@saastro/cms` (deprecated embedded CMS) to `@saastro/studio` on branch `chore/migrate-cms-to-studio`. The old `/admin` panel + stega visual editor were removed.

<claude-mem-context>
# Recent Activity

<!-- This section is auto-generated by claude-mem. Edit content outside the tags. -->

### Apr 14, 2026

| ID | Time | T | Title | Read |
|----|------|---|-------|------|
| #4789 | 7:30 PM | 🟣 | Created saastro-theme standalone Astro template with shadcn/ui | ~701 |

### Apr 15, 2026

| ID | Time | T | Title | Read |
|----|------|---|-------|------|
| #4840 | 10:00 AM | 🟣 | saastro-theme comprehensive buildout with i18n, blog, legal pages, and accessibility | ~775 |
</claude-mem-context>