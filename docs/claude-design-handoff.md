# Claude Design → saastro-theme · Handoff Playbook

> **When this applies:** every time a Claude Design output (a `.dc.html`, a handoff
> bundle, or an import via the `claude_design` MCP) lands on a copy of this theme,
> to turn it into a client landing that's ready for the Hub.
>
> **How it's loaded:** referenced from the root `CLAUDE.md` with one line. It's only
> needed when a design arrives — don't inline it into `CLAUDE.md`.

## Golden rule — port, never paste

The `.dc.html` is a **visual reference, not the product**. Never paste it into the
site or the Hub. **Port** it into Studio-instrumented sections.

Two sources of truth, and Claude Code reconciles them:

| Source | Owns |
|---|---|
| `.dc.html` (Claude Design) | the **visual** truth — layout, hierarchy, spacing rhythm |
| this theme | the **technical** truth — markers, i18n, HubForm, tokens, islands |

> **Where this sits in the pipeline:** step 3 of `pipeline.md` (repo → design → **apply**
> → ship). The repo should already exist, created with `pnpm scaffold client` from the
> Hub repo. The **`apply-handoff` skill** (`.claude/skills/apply-handoff/`) drives this
> playbook as a loop — invoke it instead of doing this by hand.

## 0. Pre-flight

1. Confirm the repo is a theme copy: `astro.config.mjs` with `saastroStudio({ autoWrap: true, autoWrapPages: true })`, `studio.config.json`, `saastrocms.config.ts`, `src/i18n/translations/*.json`. A repo made with `scaffold client` has `upstream` pointing at the theme (`git remote -v`) — if it doesn't, it was created with *"Use this template"* and can never merge theme fixes.
2. **Read the site's locales from `src/i18n/config.ts`** — the scaffold parametrizes them; a client may be `es`-only. Everything below that says "EN/ES" means "every locale this site declares".
2. Connect the MCP: `/design-login` (grants `user:design:read/write`). If `api.anthropic.com/v1/design/mcp` returns 401/404, that's the known beta flake — retry, or use the exported `.dc.html` as the reference.
3. Import the design project and open the `.dc.html` **as a reference only**. Do **not** copy it into `src/`.

## 1. Port section by section

Use the theme's **three-layer pattern** — Block → Adapter → Content. It's already
documented in `CLAUDE.md` → **"UI blocks — ui.saastro.io compatibility (the
methodology)"**; don't re-derive it. The handoff specifics:

For each visual block in the design:

1. **Key** — assign a section key. Convention: `key = fieldPrefix = top-level i18n
   namespace`, consistent casing. **There is no canonical key list** — sections are
   per-project; reuse a sensible name (`hero`, `features`, `pricing`, …) when one fits.
2. **Block** — if a `ui.saastro.io` registry block matches, pull it pristine
   (`npx shadcn add @saastro/<block>` into `src/components/ui/blocks/`). If none
   matches, author a **new pure presentational `.tsx` block** (typed props, content
   only via props, no i18n, no marker). Never hand-build markup over raw primitives
   inside a page.
3. **Adapter** — author `src/components/blocks/<Name>.astro`: wrap the block in
   `<div data-saastro={\`sec:${fieldPrefix}\`}>`, map the i18n object → the block's
   typed props, choose hydration (static → SSR / 0 JS; interactive → `client:visible`).
4. **Content** — put all copy into the translation JSON of **every locale this site
   declares** (`src/i18n/config.ts` is the source of truth — often just `es`), with full
   parity between them. Never hardcode copy in the block or adapter.
5. **Color** — map design hex → **oklch tokens** in `src/styles/global.css` (the
   single source of truth). A new brand color is a **new/edited token**, never an
   inline hex (see §3).
6. **Type & spacing** — Geist scale + the theme's spacing/radius scale; no ad-hoc values.
7. **Forms** — any form is `<HubForm>` from `@saastro/forms` (the version **pinned in
   this theme** — currently `^0.14.0`) → `submit.saastro.io`. Never a hand-rolled `<form>`.
8. **Register** — if the section is global (nav/footer) add it to `studio.config.json`;
   reflect any i18n-shape change in `saastrocms.config.ts`.

## ⚠️ Nav / Footer — sections with behavior (do NOT regenerate)

`Header`/`Footer` are **not** dumb layout — they carry logic. **Never regenerate them
from the `.dc.html`.** Only adjust their content/style; preserve the behavior:

- **Header** (`src/components/Header.astro`): `DesktopMenu.tsx` (Radix NavigationMenu,
  active-route, dropdowns), `MobileMenu.tsx` (Sheet + Accordion), `LocaleSelector.tsx`
  (EN/ES), the ContactSheet trigger.
- **Footer** (`src/components/Footer.astro`): the **"Manage cookies"** button that
  fires `cookie-consent-reopen` → reopens `CookieBanner` (delegated `document`-level
  listener so it survives ClientRouter swaps), link groups, social links, auto-year.
- **Widgets**: `src/widgets/CookieConsent/*` (consent state + reopen event),
  `src/widgets/ContactSheet/*` (Zustand store + slide-out form).

These are the dangerous case of "port, never paste": take the new look, keep the wiring.

## 2. The Hub publish allowlist

The Hub only writes back: **i18n JSON · `.md` content · `src/pages` · `src/content` ·
`studio.config.json`**. All client-editable content must live **only** there. Editable
content outside the allowlist → the client can't edit it and it's lost on the next
publish. Structure is frozen at connect time; only content flows through the Hub.

## 3. Tokens — `src/styles/global.css` is the SSOT

- All colors are **oklch** CSS variables, mapped to Tailwind via `@theme inline`.
- The base palette is **neutral** (chroma 0): `--primary: oklch(0.205 0 0)`, etc.
- A **new brand color** = give `--primary`/`--accent` real chroma, or add a `--brand`
  token, in **both** `:root` and `.dark`, then register it under `@theme inline`.
  Never an inline hex in a component.

## 4. Validation gate — `pnpm studio:check`

Before pushing, the gate must pass. It runs the **same validator as the Hub Setup
doctor** (`@saastro/studio/doctor`), so green here ⇒ green "Connect" in the Hub.
It fails on:

1. missing `data-saastro` marker on a section
2. i18n parity gaps between the site's declared locales
3. hardcoded hex (oklch tokens only)
4. raw `<form>` (must be `<HubForm>`)
5. `astro build` failure
6. (advisory) hardcoded copy in a marked section outside the i18n allowlist
7. **the cookie-policy link resolving** — if the banner links to a policy page that doesn't exist, that's a 404 in production (it happened on two live sites) and the gate now catches it
8. **the Gen beacon being declared** (`gen-legal`) — if the served DOM emits the Gen lead-attribution beacon (`settings.gen.workspaceId` set), the cookie policy must declare that processing via the `<div data-legal="gen-tracking"></div>` anchor. Canonical text to copy: **`docs/legal-gen-tracking.md`**
9. **contract drift on the BUILT DOM** — after the build, `scripts/studio-contract-check.mjs` re-validates `dist/` against `studio-contract.json` + the i18n JSONs (section/field markers per page, i18n text verbatim, schema scripts, locale parity, CSS tokens, architecture hashes); deliberate structural changes are recorded with `pnpm studio:contract:update`

> Note: `studio:check` is implemented over the shared `@saastro/studio/doctor` subpath.

## 5. Close out

Commit on a branch → push → in the Hub **"Connect existing"** → it detects
Studio + config + i18n + markers green → the client edits content in the Studio, the
structure already conforms.

## 6. Iteration / re-port (round-trip Design → Code)

Each Design handoff is a **fresh `.dc.html` from scratch, NOT a diff**:

- **Before re-porting**, `git pull` to bring down the client's Hub edits.
- After the site is connected, the **copy is owned by the Hub/client** — a re-handoff
  changes structure/visuals but **preserves existing text** unless the change is
  explicit.
- Branch + diff per iteration.
- The markers enable **surgical per-section replacement**: with Block + Adapter, a
  Design change touches **only the adapter** (and the block if the layout itself moved).

## 7. Anti-patterns (NO)

- Don't paste `.dc.html` into the Hub or `src/`.
- Don't go back to Claude Design for code fixes — those happen here.
- Don't hardcode copy or color.
- Don't add fields to the SSO session payload (a breaking change on `saastro-platform`).
- Don't add new npm deps without justification.
- Don't regenerate Nav/Footer (see above).

## 8. Keep Design aligned (one-time)

Configure the Claude Design design-system to point at this theme (or the `saastro-ui`
registry) so each new design is born with the right tokens. Sync with `/design-sync`.
