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
│   ├── Analytics.astro           # GA4 + GTM (consent-aware, reads cookie)
│   ├── AnalyticsNoscript.astro   # GTM noscript fallback
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
- Google Analytics + GTM (consent-aware)
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
- Three categories: Essential (always on), Analytics, Personalization
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

Keep the `i18n` block in `astro.config.mjs` (`routing: 'manual'`) in sync — it's the signal the Saastro Hub reads to detect locales.

### How it works

1. **Middleware** detects locale from URL prefix (`/es/about` -> `lang=es`)
2. Loads translation JSON with deep-merge fallback to default locale
3. Injects `lang`, `t`, `localePath` into `Astro.locals`
4. Pages access translations via `Astro.locals.t`

### Without i18n

Set `enabled: false`. Pages work as plain static pages. No middleware, no translation JSON. The SiteLayout uses hardcoded English defaults. The locale selector disappears from the Header.

### Adding a locale

1. Add the locale to `config.ts` (locales array + label) and to the `i18n` block in `astro.config.mjs`
2. Create `translations/{locale}.json` (copy from `en.json`)
3. Import it in `utils.ts` and add to `translationMap`
4. Add locale subfolder to `content/legal/{locale}/` for legal pages

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
3. Open the site's **Setup** page. Because the template already ships Studio + config + i18n + marked components, every step validates green — nothing to install or auto-mark.
4. Set the **deploy URL** (your Cloudflare Pages project — unique per project) and start editing content from the Hub.

What's left per project is only what's inherently per-project: the repo, the deploy target, and the real content/branding. The instrumentation travels with the template.

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

Google Analytics 4 and Google Tag Manager, both consent-aware:

1. On page load, checks `cookie_consent` cookie for analytics permission
2. If no consent yet, listens for `cookie-consent-updated` event
3. Only loads the tracking script after explicit consent

Pass IDs via SiteLayout or BaseLayout:

```astro
<SiteLayout
  analytics={{ googleAnalyticsId: 'G-XXXXXXXXXX', googleTagManagerId: 'GTM-XXXXXXX' }}
/>
```

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

This project uses **`@astrojs/cloudflare` v13**, which outputs a Workers model (`dist/server/` + `dist/client/`). Studio runs on SSR (`output: 'server'`), so deploy via **GitHub Actions + Wrangler** — CF Pages git integration alone can't deploy the worker.

### How it works

Every push to `main` triggers `.github/workflows/deploy.yml`:

```
git push → GitHub Actions
  → pnpm install
  → pnpm build            (generates dist/server/ + dist/client/)
  → wrangler pages deploy dist/client   (deploys worker + assets to CF Pages)
```

The adapter generates `dist/server/wrangler.json` at build time. Wrangler reads it automatically when deploying `dist/client`.

### First-time setup

#### 1. Create a Cloudflare API token

Cloudflare Dashboard → My Profile → API Tokens → Create Token → **"Edit Cloudflare Workers"** template:

- Account Resources: select your account
- Zone Resources: All zones

Copy the token.

#### 2. Get your Cloudflare Account ID

Cloudflare Dashboard → any page → right sidebar → **Account ID**.

#### 3. Add secrets to GitHub

GitHub → repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | Token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID from step 2 |

#### 4. Pause CF Pages git integration

CF Pages → `your-project` → Settings → Builds & deployments → **Pause deployments**.

This prevents CF Pages from trying to build via git integration (it would fail without the worker).

### Manual deploy (emergency)

```bash
pnpm build
pnpm dlx wrangler pages deploy dist/client --project-name your-project --branch main
```

Requires `wrangler login` first.

### Deploy to other hosts

Swap the adapter in `astro.config.mjs`:

```bash
pnpm dlx astro add vercel    # Vercel
pnpm dlx astro add netlify   # Netlify
pnpm dlx astro add node      # Any Node.js server
```

## License

MIT
