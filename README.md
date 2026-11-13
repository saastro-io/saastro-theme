# Saastro Theme

Standalone Astro template with shadcn/ui, **pre-instrumented for [Saastro Studio](https://hub.saastro.io)**. Use it as the base for new client projects: create from this template, connect it in the Saastro Hub, and every section is editable from day one — no instrumentation work needed.

## Tech Stack

- **Astro 6** (SSR on Cloudflare Workers)
- **React 19** (interactive islands)
- **Tailwind CSS 4** (oklch tokens, dark mode)
- **shadcn/ui** (Nova preset, Geist font, Radix primitives)
- **Zustand** (lightweight state for widgets)
- **astro-icon** + Tabler + Lucide icons
- **@saastro/studio** (build-time instrumentation — visual editing happens in the Saastro Hub, not inside the site)

## Quick Start

```bash
pnpm install
pnpm dev          # http://localhost:4930
pnpm build        # Cloudflare Workers output to dist/
pnpm preview      # Preview production build
```

## Project Structure

```
src/
├── components/
│   ├── Header.astro              # Sticky header: logo, nav, locale selector, contact button
│   ├── Footer.astro              # Props-driven footer with link groups, socials, copyright
│   ├── Hero.astro                # Hero section with eyebrow, title array, stats, CTAs
│   ├── AboutContent.astro        # About page sections (mission, values grid)
│   ├── Products.astro            # Product showcase grid (4 cards)
│   ├── Logo.astro                # Light/dark logo with fallback initials
│   ├── ToggleTheme.astro         # Light/dark/system toggle (anti-FOUC)
│   ├── DesktopMenu.tsx           # shadcn NavigationMenu with dropdowns
│   ├── MobileMenu.tsx            # shadcn Sheet + Accordion for mobile nav
│   ├── LocaleSelector.tsx        # EN / ES locale switcher (opt-in)
│   ├── Analytics.astro           # Pixels from settings.tracking.* (consent-aware, reads cookie)
│   ├── JsonLd.astro              # Structured data (Organization, Article, etc.)
│   ├── OgImage.astro             # SVG-based OG image template (1200x630)
│   └── ui/                       # shadcn primitives
│       ├── accordion.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── label.tsx
│       ├── navigation-menu.tsx
│       ├── scroll-area.tsx
│       ├── separator.tsx
│       ├── sheet.tsx
│       └── switch.tsx
├── layouts/
│   ├── BaseLayout.astro          # HTML shell: SEO, OG, analytics, dark mode, hreflang
│   └── SiteLayout.astro          # Extends BaseLayout + Header + Footer + widgets
├── pages/
│   ├── index.astro               # Home page (default locale, root)
│   ├── about.astro               # About page (default locale, root)
│   ├── [locale]/                 # Non-default locales (e.g. /es/*)
│   ├── 404.astro                 # Not found page
│   ├── 500.astro                 # Server error page
│   ├── blog/                     # Blog listing + post
│   └── legal/                    # Legal pages from content collection
├── content/
│   ├── blog/                     # Markdown blog posts (flat, single-language)
│   │   ├── getting-started.md
│   │   └── dark-mode-implementation.md
│   └── legal/                    # Legal pages (locale subfolders)
│       ├── en/
│       │   ├── cookies.md
│       │   ├── privacy.md
│       │   └── terms.md
│       └── es/
│           ├── cookies.md
│           ├── privacy.md
│           └── terms.md
├── widgets/
│   ├── Announcement/
│   │   └── Announcement.tsx      # Top banner: badge, dismiss, localStorage persist
│   ├── ContactSheet/
│   │   ├── ContactSheet.tsx      # Slide-out contact panel (lazy-loaded; form is a placeholder)
│   │   ├── ContactSheetButton.tsx # Opens ContactSheet from anywhere
│   │   ├── ContactSheetProvider.tsx # Mounted once in SiteLayout
│   │   ├── store.ts              # Zustand store for open/close state
│   │   └── index.ts
│   └── CookieConsent/
│       └── CookieBanner.tsx      # GDPR cookie banner with customize toggles
├── i18n/
│   ├── config.ts                 # enabled: true/false, locales, labels
│   ├── types.ts                  # Translations interface (extensible)
│   ├── utils.ts                  # getTranslations, localePath, deepMerge, getLocaleLinks
│   ├── index.ts                  # Barrel export
│   └── translations/
│       ├── en.json               # English (base)
│       └── es.json               # Spanish (falls back to English for missing keys)
├── integrations/
│   └── strip-studio-meta-middleware.ts  # Strips Studio meta tags from prod HTML
├── lib/
│   ├── cookies.ts                # getConsent, setConsent, hasConsent (cookie-based)
│   ├── reading-time.ts           # Auto reading time calculation from markdown
│   ├── settings.ts               # Typed settings.yaml reader (cached, frozen)
│   └── utils.ts                  # cn() — clsx + tailwind-merge
├── head/
│   └── Favicons.astro            # Favicon links (svg, ico, apple-touch-icon)
├── scripts/
│   └── ApplyColorMode.astro      # Inline script preventing dark mode FOUC
├── styles/
│   └── global.css                # Tailwind 4 + shadcn tokens + dark mode + print styles
├── middleware.ts                 # i18n locale detection (populates Astro.locals)
├── content.config.ts             # Astro content collections (legal, blog)
└── env.d.ts                      # Astro.locals types (lang, t, localePath)

saastrocms.config.ts              # Collections + i18n shape (read by the Hub)
studio.config.json                # Studio: global sections (nav, footer)
```

## Layouts

### BaseLayout

Pure HTML shell. Handles everything that goes in `<head>`:

- SEO meta tags (title, description, canonical)
- Open Graph + Twitter Card
- Hreflang links (when i18n is enabled)
- Measurement pixels from `settings.tracking.*` (consent-aware, see [Analytics](#analytics))
- Google Site Verification
- Dark mode (anti-FOUC inline script)
- View Transitions (`ClientRouter`)
- Favicons
- Skip-to-content link (WCAG 2.1)

Use BaseLayout directly for custom layouts (auth pages, landing pages, etc.).

### SiteLayout

Extends BaseLayout with the standard page chrome:

- Header with navigation, locale selector, contact button
- Footer with legal links
- Announcement banner (opt-in)
- ContactSheet provider (lazy-loaded)
- Cookie consent banner (GDPR-compliant)

All widgets auto-translate when i18n is enabled.

## Widgets

### Cookie Banner

GDPR-compliant cookie consent with granular control. Uses shadcn Button, Switch, Label, Separator.

- Shows on first visit, saves preference in `cookie_consent` cookie (1 year)
- Categories: Essential (always on), Analytics, Marketing (the switch only appears when the site has an ad pixel configured), Personalization
- Customize mode with individual toggles
- Fires `cookie-consent-updated` event — Analytics component listens for it
- Auto-translates via i18n when enabled

### Contact Sheet

Lazy-loaded slide-out panel for a contact form. Uses Zustand for state management.

- `ContactSheetButton` can be placed anywhere (Header has it by default)
- `ContactSheetProvider` mounted once in SiteLayout — no duplicates
- Sheet only loads on first click (code-split via `React.lazy`)
- **The form body is a placeholder** ("Form coming soon"). Drop in your form per project — e.g. `@saastro/forms`' `HubForm` — and wire submit in the Hub.

### Announcement

Dismissible top banner. Uses shadcn Badge and Button.

- Persistent dismiss via localStorage
- Enable per-page: `<SiteLayout showAnnouncement announcement={{ text: '...', badge: 'NEW' }} />`

## i18n

Opt-in internationalization. Default locale (`en`) is served at the root; non-default locales (`es`) are prefixed (`/es/...`) via the `[locale]/` routes.

### Enable

Edit `src/i18n/config.ts`:

```ts
export const i18nConfig = {
  enabled: true,          // Toggle on
  defaultLocale: 'en',
  locales: ['en', 'es'],  // Add your locales
};
```

`astro.config.mjs` (Astro `i18n`, sitemap, Studio) derives its locales from this file: there is no second list to keep in sync. Full guide: `docs/idiomas.md`.

### How it works

1. **Middleware** detects locale from URL prefix (`/es/about` -> `lang=es`)
2. Loads translation JSON with deep-merge fallback to default locale
3. Injects `lang`, `t`, `localePath` into `Astro.locals`
4. Pages access translations via `Astro.locals.t`

### Without i18n

Use a single locale (`locales: ['es']`) or set `enabled: false` (= base locale only). No prefixed routes, no locale selector, no hreflang. The middleware still fills `Astro.locals`. See `docs/idiomas.md`.

### Adding a locale

1. Add the locale to `config.ts` (`locales` + `localeLabels`)
2. Create `translations/{locale}.json` (copy from `en.json`) — the build fails if it is missing
3. Add its 404 text to `src/lib/not-found.ts` and the locale to `saastrocms.config.ts`
4. Add locale subfolder to `src/content/legal/{locale}/` for legal pages
5. `pnpm studio:contract:update`

### Content collections with i18n

Legal pages use locale subfolders: `content/legal/en/cookies.md`, `content/legal/es/cookies.md`. The dynamic page `[slug].astro` filters by the current locale from the middleware.

Blog posts are single-language (flat folder). For translated blog posts, add locale subfolders following the same pattern as legal.

## Studio Integration

This theme ships **pre-instrumented for Saastro Studio**. Unlike a traditional CMS, there is **no admin panel inside the site** — content editing happens in the **Saastro Hub**, which renders this site in a live preview and writes edits back to your repo.

The site's only job is to be *instrumented*: the `@saastro/studio` Vite plugin plus a few `data-saastro` markers tell the Hub which sections are editable and which translation keys they map to.

### What's wired

| Piece | Where | Purpose |
|---|---|---|
| `@saastro/studio` plugin | `astro.config.mjs` — `saastroStudio({ autoWrap: true, autoWrapPages: true })` | Build-time instrumentation; injects the Studio handshake in dev |
| `stripStudioMeta` integration | `astro.config.mjs` + `src/integrations/strip-studio-meta-middleware.ts` | Removes Studio's dev-only `<meta>` tags from prod HTML |
| `data-saastro="sec:<key>"` markers | section components (Hero, AboutContent, Header, Footer) | Mark each editable section + bind it to an i18n namespace |
| `studio.config.json` | repo root | Declares global sections (`nav`, `footer`) that appear on every page |
| `saastrocms.config.ts` | repo root | Collections + i18n shape, read by the Hub via static parsing (no runtime import) |
| i18n JSON | `src/i18n/translations/*.json` | The editable content itself |

### The `fieldPrefix` → marker → i18n chain

Each section component takes a `fieldPrefix` prop and emits it as a `data-saastro` marker on its root element:

```astro
<!-- Hero.astro -->
<section data-saastro={`sec:${fieldPrefix ?? 'hero'}`}>…</section>
```

The page (or layout) passes the prefix, and it must match a top-level namespace in the translation JSON:

```astro
<!-- index.astro -->
<Hero title={hero.title} subtitle={hero.subtitle} fieldPrefix="hero" />
```

The Hub's section scanner ("doctor") reads every `.astro`/`.tsx` file, finds the markers, cross-references them with the translation JSON, and renders an edit form for each section.

| Component | `fieldPrefix` | i18n namespace |
|-----------|--------------|----------------|
| Hero | `"hero"` | `hero` |
| AboutContent | `"about"` | `about` |
| Header | `"nav"` | `nav` (global) |
| Footer | `"footer"` | `footer` (global) |

> **Adding a new editable section:** give the component a `fieldPrefix` prop, emit `` data-saastro={`sec:${fieldPrefix ?? '<key>'}`} `` on its root tag, pass `fieldPrefix="<key>"` from the page, and add a `<key>` namespace to `src/i18n/translations/*.json`. Lowercase-tag sections that render `t.<key>` directly are auto-marked by `autoWrap`; PascalCase components like these carry the marker by hand.

## Using as a base for new projects

This repo is a **GitHub Template repository**. To start a new client site:

1. **GitHub → "Use this template" → Create a new repository.**
2. In the **Saastro Hub**, open the workspace → **New site → "Connect existing"** and pick the new repo.
3. Open the site's **Setup** page. The Studio instrumentation (config, i18n, marked components) travels with the template, so there is nothing to install or auto-mark.
4. Set `SITE_URL` to the real domain and the **deploy target** (a Cloudflare Workers project, see [Deploy](#deploy-to-cloudflare)).
5. **Clean what the template inherits before publishing.** The repo is also the theme's own showcase site, so a new site starts with the theme's home page, sample posts and generic legal texts (the measurement ids and the WhatsApp number now ship empty; `theme.saastro.io` gets its own through build variables). Passing the Studio checks does not mean these are clean. The exact list, with where each one is changed and which ones the Hub rewrites by itself, is in [docs/nuevo-site-checklist.md](docs/nuevo-site-checklist.md).

## Content Collections

### Blog

Flat markdown files in `src/content/blog/`. Schema:

| Field | Type | Required | Default |
|-------|------|----------|---------|
| title | string | yes | - |
| description | string | yes | - |
| date | date | yes | - |
| author | string | no | "Saastro" |
| image | string | no | - |
| imageAlt | string | no | "Blog post image" |
| tags | string[] | no | - |
| featured | boolean | no | - |
| readingTime | number | no | - |

### Legal

Locale-subfolder markdown in `src/content/legal/{locale}/`. Schema:

| Field | Type | Required |
|-------|------|----------|
| title | string | yes |
| description | string | yes |
| lastUpdated | date | yes |

## Header Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| siteName | string | "Saastro" | Logo text |
| logoLight | string | - | Light mode logo path |
| logoDark | string | - | Dark mode logo path |
| homeUrl | string | "/" | Logo link |
| menu | MenuItem[] | [] | Navigation items |
| isSticky | boolean | true | Sticky header |
| showToggleTheme | boolean | true | Show dark mode toggle |
| showContactButton | boolean | true | Show contact CTA |
| contactButtonLabel | string | "Contact" | CTA text |
| localeLinks | LocaleLink[] | [] | Language switcher (auto-set by SiteLayout) |

## Dark Mode

Three modes: Light, Dark, System. Preference saved in `localStorage`.

The `ApplyColorMode` inline script runs before paint — no FOUC. It checks `localStorage` first, then falls back to `prefers-color-scheme`.

## Analytics

Measurement ids live in `src/data/settings.yaml` under `tracking:` (empty = off; the template ships them empty) or in build variables `PUBLIC_TRACKING_<KEY>` (`PUBLIC_TRACKING_GA4`, `PUBLIC_TRACKING_CLARITY`, `PUBLIC_TRACKING_CLOUDFLARE_WEB_ANALYTICS`, `PUBLIC_TRACKING_META_PIXEL`, …: the key in UPPER_SNAKE_CASE; full list in [docs/guia-pixeles.md](docs/guia-pixeles.md#variables-de-build-las-pone-el-despliegue)). A non-empty variable wins over `settings.yaml`; an invalid one is dropped with a build warning and does NOT fall back to settings. They are not secrets (they end up in the served HTML) and are read at build time. The floating WhatsApp widget mounts only with a number: `PUBLIC_WHATSAPP_NUMBER` or the i18n key `whatsapp.number` (empty in the template); it also needs the `whatsapp` i18n block (its texts). `Analytics.astro` reads the resolved ids; there is nothing to pass as props.

| Key | Provider | Waits for consent |
|---|---|---|
| `ga4` | Google Analytics 4 | `analytics` |
| `gtm` | Google Tag Manager | `analytics` or `marketing` |
| `googleAds` (+ `googleAdsConversionLabel`) | Google Ads | `marketing` |
| `metaPixel` | Meta Pixel | `marketing` |
| `tiktokPixel` | TikTok Pixel | `marketing` |
| `linkedinPartnerId` | LinkedIn Insight Tag | `marketing` |
| `clarity` | Microsoft Clarity | `analytics` |
| `cloudflareWebAnalytics` | Cloudflare Web Analytics | **exempt**: loads without consent (the catalogue records the reason) |

- Each key accepts several ids separated by commas (`"G-AAAA…,G-BBBB…"`, max 5; Clarity and Cloudflare, 1). Invalid ids are dropped with a build warning.
- Google tags declare Consent Mode v2 `default: denied` before any Google script; if there is no consent yet, the component listens for `cookie-consent-updated`.
- No pixel loads in the Studio preview or local dev. There is no GTM `<noscript>` iframe: without JS the visitor cannot consent.
- Turning a provider on adds a processing: the cookie policy must declare it (`<div data-legal="tracking-…">`, see `docs/legal-marketing.md`) or `pnpm studio:check` fails. Cloudflare Web Analytics has no anchor because it is exempt.
- Old routes (`analytics.googleAnalytics.id`, `analytics.cloudflareWebAnalytics.token`) are still read as a fallback; `tracking.*` wins.

### Lead attribution (SAASTRO Gen) — opt-in

`GenTracking.astro` reports where leads come from. On each page load it POSTs a
page-view to the Gen collector (`{endpoint}/collect`) keyed by an anonymous
`visitorId` kept in **sessionStorage** (no cookies; by default gated on the
banner's `analytics` consent), and injects that id into every `<form>` as a hidden `gen_visitor_id`
field. When the form is submitted the id rides along, so Gen links the lead to
its pre-conversion journey → first/last-touch attribution + funnel/CPL per
channel (source · medium · campaign).

**Opt-in, not wired by default** — add it to your layout only when you want the
site tracked (typically inside the `<head>`, e.g. in `BaseLayout` or a page):

```astro
---
import GenTracking from '../components/GenTracking.astro';
---
<GenTracking workspaceId="team_123" vertical="realestate" />
```

Props (all but `workspaceId` optional):

| Prop          | Default                    | Notes                                                        |
| ------------- | -------------------------- | ------------------------------------------------------------ |
| `workspaceId` | —                          | Gen workspace = the SAASTRO Platform team id. **Public** (like a GA measurement id — no secret in the browser). |
| `vertical`    | `"default"`                | Product surface within the workspace (free string).          |
| `endpoint`    | `"https://gen.saastro.io"` | Gen collector origin.                                        |
| `consent`     | `"required"`               | `"required"` = nothing (no id, no form field, no request) until the visitor accepts the `analytics` category of the cookie banner (mirrored in `localStorage['gen-consent']`); reject/revoke deletes the id. `"none"` = tracks immediately, only if the site owner has decided the beacon is exempt. |

Notes:

- Skips editor previews and local dev automatically (any `localhost` /
  `*.saastro.io` / `*.saastro.test` / `*.local` host) so the Studio preview and
  dev sessions never pollute attribution data.
- Zero dependencies, inline IIFE, fully defensive (a down/blocked collector
  never breaks the page). Fires on initial load and every View-Transitions
  navigation.
- If the site sets a Content-Security-Policy, allow the collector in
  `connect-src` (e.g. `https://gen.saastro.io`).

## Accessibility

- Skip-to-content link (visible on Tab)
- Focus-visible rings on all interactive elements
- `aria-current="page"` on active nav links and locale selector
- Semantic HTML (`<main>`, `<nav>`, `<article>`, `<aside>`)
- Print styles (hides chrome, shows link URLs)
- `scroll-padding-top` for sticky header offset on anchor links

## Adding shadcn Components

```bash
pnpm dlx shadcn@latest add card dialog dropdown-menu table
```

Components install to `src/components/ui/`. Import with the `@/` alias:

```tsx
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
```

## Customization

### Colors

Edit CSS variables in `src/styles/global.css`. The theme uses oklch color tokens from shadcn's Nova preset. Change `:root` for light mode and `.dark` for dark mode.

### Fonts

Default: Geist Variable (via `@fontsource-variable/geist`). Change in `global.css`:

```css
--font-sans: 'Your Font', sans-serif;
```

### Menu

Pass a `menu` prop to Header (auto-set when using SiteLayout with a custom Header slot):

```astro
<Header menu={[
  { title: 'Home', url: '/' },
  { title: 'Blog', url: '/blog' },
  { title: 'Services', url: '/services', items: [
    { title: 'Design', url: '/services/design' },
    { title: 'Development', url: '/services/development' },
  ]},
]} />
```

## Commands

| Command | Action |
|---------|--------|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Dev server at localhost:4930 |
| `pnpm build` | Build to `dist/` |
| `pnpm preview` | Preview production build |
| `pnpm dlx shadcn@latest add [component]` | Add shadcn components |

## Deploy to Cloudflare

This theme deploys as a **Cloudflare Worker** (SSR, `@astrojs/cloudflare` v13 —
`dist/server/` + `dist/client/`). Deployment is **wired by the Saastro Hub via
Cloudflare Workers Builds** — there is **no Cloudflare token in this repo**. On
*New site from template*, the Hub connects the repo so Cloudflare builds + deploys
on every push to `main`.

**See [docs/deploy.md](docs/deploy.md)** for the full model, the one-time
operator prerequisites (Hub-side: the CF↔GitHub connection, `CF_BUILDS_TOKEN`,
`CF_BUILD_TOKEN_UUID`), and how to deploy manually.

```bash
# Manual deploy (rare — Cloudflare does this on push)
pnpm build      # emits dist/server/wrangler.json (name inherited from wrangler.jsonc)
npx wrangler deploy --config dist/server/wrangler.json
```

### Deploy to other hosts

Swap the adapter in `astro.config.mjs`:

```bash
pnpm dlx astro add vercel    # Vercel
pnpm dlx astro add netlify   # Netlify
pnpm dlx astro add node      # Any Node.js server
```

## License

MIT
