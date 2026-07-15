# saastro-theme — Studio-ready base template

This repo is the **canonical base template for new Saastro client sites**: a standalone Astro 6 + React 19 + Tailwind 4 + shadcn/ui marketing site, **pre-instrumented for Saastro Studio** (the editor lives in the Saastro Hub, not in this site).

It is **not** part of the 3-repo `~/SAASTRO` workspace (hub/platform/forms) — it's a separate `saastro-io/saastro-theme` repo.

**A new client site is created with `pnpm scaffold client` from the Hub repo** (see "New project pipeline" below) — never with GitHub *"Use this template"*, which produces a repo with **no common history** with this theme: such a descendant can never `git merge upstream/main`, so every theme fix has to be back-ported by hand.

## Model (why this exists)

- New projects start from this template via `pnpm scaffold client` (the subcommand clones THIS repo with full history + `upstream`), then connect in the Hub.
- The template already ships everything the Hub's Setup detectors look for, so **the Setup page validates green with zero instrumentation work** (Install Studio / Generate config / Auto-mark find nothing to do). Setup's role becomes validation, not setup.
- `@saastro/scaffold` has two paths: `scaffold client` (a descendant of THIS repo — the one you want for a client site) and the blank-greenfield engine the Hub wizard uses, which is not this repo.
- `enlolab/dorjoiers` is a production descendant of this theme (its `package.json` is still named `saastro-theme`) — use it as the reference for any Studio-wiring question.

## Studio instrumentation (the contract)

| Piece | File |
|---|---|
| `@saastro/studio` Vite plugin (`autoWrap` + `autoWrapPages`) | `astro.config.mjs` |
| `stripStudioMeta` integration (strips dev meta tags in prod) | `astro.config.mjs` + `src/integrations/strip-studio-meta-middleware.ts` |
| `data-saastro="sec:<key>"` markers on section roots | auto-injected by the plugin (≥0.10.1) from the `fieldPrefix` destructuring default; islands spread `@saastro/studio/markers` helpers |
| Global sections (nav/footer) | `studio.config.json` |
| Collections + i18n shape (parsed by the Hub) | `saastrocms.config.ts` (interface inlined — no `@saastro/cms` dep) |
| Editable content | `src/i18n/translations/{en,es}.json` |

**Editable = what's in i18n.** A section is editable when its component emits a `data-saastro="sec:<key>"` marker on its root tag (built from the `fieldPrefix` prop the page/layout passes) AND `<key>` is a top-level namespace in the translation JSON. Marked keys: `hero`, `products`, `about`, `nav`, `footer`. Every section component now follows this contract (prop-driven + i18n + marker) — no hardcoded sections remain.

> Since `@saastro/studio` **0.10.1** the plugin auto-injects BOTH the `sec:` root
> marker AND the `data-saastro-field` markers in `.astro` sections whose
> frontmatter declares `fieldPrefix` (the 0.10.0 bug — `instrumentFields` bailing
> without a literal `data-saastro=` in the source — is fixed). No `.astro` section
> hand-writes markers anymore: the default lives in the destructuring
> (`fieldPrefix = 'hero'`) and the plugin does the rest. React islands are never
> auto-instrumented — they spread the pure helpers from the SSR/browser-safe
> subpath **`@saastro/studio/markers`** (`editableSection`/`editableField`/
> `editableSlot`), which the doctor requires (`island_raw_markers` warns on
> hand-typed attributes). Single exception: `ToggleTheme.astro` keeps its
> hardcoded marker (no `fieldPrefix` prop — deliberate).

## Contract check over the BUILT DOM — `studio-contract.json`

`pnpm studio:check` is the single full-verdict command: source doctor
(`scripts/studio-check.mjs`) → `astro build` → **contract check over `dist/`**
(`scripts/studio-contract-check.mjs`). The contract layer compares the built
HTML against two sources of truth: the i18n JSONs and **`studio-contract.json`**
(committed manifest at the repo root) — per-page section/field markers, i18n
text verbatim in the HTML (stega/click-to-edit precondition), raw editable
images, schema scripts, locale parity, emitted CSS tokens (`--font-body`/
`--font-display`/`.ac`), the `#manage-cookies-btn`, the cookie-policy link
resolving, **the Gen beacon's legal declaration** (`gen-legal`: if the served DOM
emits the Gen beacon, the cookie policy must declare that processing — canonical
text ready to copy in `docs/legal-gen-tracking.md`), form-primitive exports, and
sha256 hashes of pure-architecture files.

The manifest is **never regenerated automatically**: after a deliberate
structural/architecture change run `pnpm studio:contract:update` and commit the
diff. A red check = the built DOM diverged from the recorded contract; each
failure says which invariant, which page/section/field, and what to do.

## New project pipeline (briefing → Design → this template → live)

The full route, and what runs it, is in **`docs/pipeline.md`**. Short version:

1. **Create the repo** — from the Hub repo: `pnpm scaffold client <slug> --name "…" --domain … --owner … --locales es --default es`. Clones this theme with **full history** + `upstream`, parametrizes identity/locales/collections, and only commits if `studio:check` is green.
2. **Design** — brief in Claude.ai → Claude Design → handoff (`.dc.html` / MCP).
3. **Apply the handoff** — in the client repo, run the **`apply-handoff` skill** (`.claude/skills/apply-handoff/`, inherited by every copy): it ports the design into the free zone and loops until `pnpm studio:check` is green.
4. **Ship** — branch → PR → deploy → Hub *"Connect existing"* (green here ⇒ green there).

Bring theme fixes down anytime: `git fetch upstream && git merge upstream/main`.

## Claude Design handoff

When a design from **Claude Design** arrives (a `.dc.html` / the `claude_design` MCP),
follow **`docs/claude-design-handoff.md`** — or just invoke the **`apply-handoff`
skill**, which drives that playbook as a loop. Golden rule: **port, never paste**.
**Nav/Footer are not regenerated** — they carry behavior (mobile menu, locale switcher,
the "Manage cookies" reopen, contact sheet); take the new look, keep the wiring.

**Naming convention:** a section's `key = fieldPrefix = top-level i18n namespace` (the
marker is `data-saastro="sec:<key>"`). There's no canonical key list — sections are
per-project; `pnpm studio:check` validates internal coherence (marker ↔ i18n ↔ page),
not membership in a fixed list.

**Fonts — decision on record (owner, 2026-07-16):** client sites **load Google
Fonts from Google's CDN; they do NOT self-host**. This template itself bundles
Geist, but a redesign that pulls fonts from `fonts.googleapis.com` is following
the owner's explicit call, not a mistake to "fix". Two consequences that ARE
binding: (1) the site's cookie/privacy policy must **declare** the transfer (the
visitor's browser sends its IP to Google on every page load, before the consent
banner exists) — an undeclared third-party font load is the actual problem, not
the font source; (2) don't spend a round trip re-raising it: the trade-off
(convenience vs. an EU-transfer question that has case law behind it) was put to
the owner and decided. Revisit only if the owner asks.

**Tokens SSOT:** `src/styles/global.css` — oklch variables mapped via `@theme inline`.
The base palette is neutral (chroma 0); a brand color means giving `--primary`/`--accent`
real chroma or adding `--brand` in `:root` + `.dark`, never an inline hex.

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
- SSR on Cloudflare **Workers** (`@astrojs/cloudflare` v13 — `output: 'server'`). `pnpm build`
  emits `dist/server/wrangler.json` (the adapter derives it from the root `wrangler.jsonc`,
  inheriting `name`); deploy is `wrangler deploy --config dist/server/wrangler.json`.
- **Deploy is wired by the Hub, not by a workflow in this repo.** On *New site from
  template*, the Hub rewrites `wrangler.jsonc` `name` → the site slug and connects the repo
  to **Cloudflare Workers Builds** (git-integration) using the Hub's own credentials — so CF
  builds + deploys on every push with **no token in this repo**. The `deploy` block in
  `saastro.template.json` declares the `buildCommand`/`deployCommand`/`wranglerConfig` that
  drives it. (There is intentionally no `.github/workflows/deploy.yml` — it was removed in
  the token-free pivot; a workflow here would need a CF secret in every client repo.)
- CI (`.github/workflows/ci.yml`) still runs `pnpm studio:check` — no secrets needed.

## SEO + Studio gotchas (learned from yogui-bebes — don't repeat)

These are template-level traps that every descendant site inherits unless fixed here.

- **`site` / canonical (CRITICAL).** `astro.config.mjs` reads the canonical domain from
  the **`SITE_URL`** build env var, falling back to the template domain. Every project MUST
  set `SITE_URL` (Cloudflare Workers Builds env var) to its real domain — otherwise
  `<link rel="canonical">`, OG/Twitter URLs, the sitemap and hreflang all point at
  `saastro-theme.pages.dev` and Google indexes the wrong host. The build prints a warning
  when `SITE_URL` is unset. (TODO Hub: set `SITE_URL` automatically when a custom domain is
  connected.)
- **`LocalBusinessJsonLd.astro`** emits `Store`/`LocalBusiness` structured data from i18n
  (`contact` + `visitanos` + `meta`). It renders **nothing** until the site adds a
  `contact` namespace with at least `addressLine1`. For a local-business site, add:
  `contact.{addressLine1, addressLine2 ("CP Localidad (Provincia)"), phoneHref, instagramUrl,
  facebookUrl, directionsUrl}` + `visitanos.hours[]` ({days, time}) and the schema fills in
  (address, hours, sameAs) automatically. Critical for local SEO rich results.
- **Baseline site schema — `SiteJsonLd.astro` (wired in `BaseLayout`).** Emits a `WebSite`
  entity always, plus a primary entity (`Person` | `Organization` | `ProfessionalService`)
  when `seo.schemaType` is set in `src/data/settings.yaml`. **New site onboarding: fill the
  `seo` block** (`schemaType`, `email`, `jobTitle` for Person, `sameAs[]` — profiles + owned
  domains). Left empty, the site emits only `WebSite` (no rich-result identity). This is
  separate from `LocalBusinessJsonLd` (NAP/hours) above — a site can use either, both, or
  just the default WebSite.
- **Counters / count-up stats must render the FINAL value in SSR, not `0`.** A common bespoke
  pattern animates a number from 0 on scroll. If the served HTML hardcodes `>0<` and only JS
  fills the real value, crawlers and no-JS users see `0` — a terrible signal on a "trajectory"
  stat. Render `{value}{suffix}` as the node's text content and keep the target in a
  `data-count` attribute for the animation to read; the count-up still works, the real number
  is in the DOM. (Fixed in `enlolab-site` Services.astro.)
- **`robots.txt` is a generated endpoint (`src/pages/robots.txt.ts`), NOT a static file.** It
  derives the `Sitemap:` line from `Astro.site` (= `SITE_URL`) so it always matches the
  deployed domain. **Do NOT add a `public/robots.txt`** — a static file hardcodes the host and
  silently ships the wrong sitemap URL to descendant sites (the original template bug:
  `saastro-theme.pages.dev` leaked into a live site).
- **NEVER import `@saastro/studio` (package ROOT) in a runtime component.** Its main entry
  bundles the Node Vite plugin (references `__filename`) and **500s under the workerd SSR
  runtime**. Import only the SSR-safe subpaths: `@saastro/studio/Img.astro`, and — for the
  editable-marker helpers in islands — **`@saastro/studio/markers`** (≥0.10.1:
  `editableSection`/`editableField`/`editableSlot`/`editableImage`/`editableArrayItem`).
  Don't inline copies of the helpers anymore — the subpath is workerd-safe and the doctor
  recognizes the import.
- **Collection-backed sections: load the collection INSIDE the component, never pass it as
  an editable `items` prop.** If a section receives `items` as a prop, autoWrap exposes it as
  a Studio field (often `kind: json` for unions → a broken raw-JSON editor + "NEEDS CONFIG"),
  and any inline edit is a dead write (the data lives in the collection, not i18n). Do
  `const items = await getCollection('x')` in the `.astro` frontmatter; keep only the section
  header (`eyebrow`/`title`) as i18n props. Edit the entries in Hub → Collections.
- **`output: 'server'` + locale routes** use the rest-spread `src/pages/[...locale]/` dir.
  The Hub's Studio publish resolves both `[locale]/` and `[...locale]/` (fixed), but keep the
  convention consistent so `section_props_update` page paths resolve.
- **Favicons + PWA icons are generated from ONE source.** Drop a compact brand mark (a
  square-ish SVG — an icon, not a wordmark) at `public/SVG/icon.svg` and run
  `node scripts/gen-favicons.mjs`. It writes the whole set — `favicon.svg`/`.ico`,
  `favicon-16/32/48`, `apple-touch-icon`, and PWA `icon-192/512` (+ `-maskable`) — all already
  wired in `src/head/Favicons.astro` + `public/manifest.json`. **New site onboarding: replace
  `icon.svg` with the client's mark and re-run**, or the site ships the template's default icon
  (same class of "born with the template's identity" trap as `SITE_URL`). sharp is resolved
  from the pnpm store, so no extra dep.

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