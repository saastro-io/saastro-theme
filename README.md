# Saastro Theme

Standalone Astro template with shadcn/ui and optional CMS integration. Zero private dependencies — works out of the box for any project.

## Tech Stack

- **Astro 6** (static + SSR-ready)
- **React 19** (interactive islands)
- **Tailwind CSS 4** (oklch tokens, dark mode)
- **shadcn/ui** (Nova preset, Geist font, Radix primitives)
- **Zustand** (lightweight state for widgets)
- **astro-icon** + Tabler + Lucide icons
- **@saastro/cms** (optional — admin panel, visual editor, translation management)

## Quick Start

```bash
bun install
bun run dev       # http://localhost:4930
bun run build     # Static output to dist/
bun run preview   # Preview production build
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
│   ├── index.astro               # Home page
│   ├── about.astro               # About page
│   ├── 404.astro                 # Not found page
│   ├── 500.astro                 # Server error page
│   ├── rss.xml.ts                # RSS feed endpoint
│   ├── blog/
│   │   ├── index.astro           # Blog listing (paginated, grid with badges)
│   │   └── [slug].astro          # Blog post (prose, TOC sidebar, related posts)
│   └── legal/
│       └── [slug].astro          # Legal pages from content collection (TOC sidebar)
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
│   │   ├── ContactSheet.tsx      # Slide-out contact panel (lazy-loaded)
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
├── middleware.ts                  # i18n locale detection + URL rewriting
├── content.config.ts             # Astro content collections (legal, blog)
└── env.d.ts                      # Astro.locals types (lang, t, localePath)
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

Lazy-loaded slide-out panel for contact forms. Uses Zustand for state management.

- `ContactSheetButton` can be placed anywhere (Header has it by default)
- `ContactSheetProvider` mounted once in SiteLayout — no duplicates
- Sheet only loads on first click (code-split via `React.lazy`)

### Announcement

Dismissible top banner. Uses shadcn Badge and Button.

- Persistent dismiss via localStorage
- Enable per-page: `<SiteLayout showAnnouncement announcement={{ text: '...', badge: 'NEW' }} />`

## i18n

Opt-in internationalization. Disabled by default.

### Enable

Edit `src/i18n/config.ts`:

```ts
export const i18nConfig = {
  enabled: true,          // Toggle on
  defaultLocale: 'en',
  locales: ['en', 'es'],  // Add your locales
};
```

### How it works

1. **Middleware** detects locale from URL prefix (`/es/about` -> `lang=es`)
2. Loads translation JSON with deep-merge fallback to default locale
3. Applies stega encoding if visual editor session is active (see [CMS Integration](#stega-encoding-and-the-visual-editor))
4. Injects `lang`, `t`, `localePath` into `Astro.locals`
5. Rewrites URL to strip prefix (`/es/about` -> `/about`)
6. Pages access translations via `Astro.locals.t`

**One folder of pages** — no duplication per locale. The middleware handles routing.

### Without i18n

Set `enabled: false`. Pages work as plain static pages. No middleware, no translation JSON. The SiteLayout uses hardcoded English defaults. The locale selector disappears from the Header.

### Adding a locale

1. Add the locale to `config.ts` (locales array + label)
2. Create `translations/{locale}.json` (copy from `en.json`)
3. Import it in `utils.ts` and add to `translationMap`
4. Add locale subfolder to `content/legal/{locale}/` for legal pages

### Content collections with i18n

Legal pages use locale subfolders: `content/legal/en/cookies.md`, `content/legal/es/cookies.md`. The dynamic page `[slug].astro` filters by the current locale from the middleware.

Blog posts are single-language (flat folder). For translated blog posts, add locale subfolders following the same pattern as legal.

## CMS Integration

This theme includes `@saastro/cms` for content management with an admin panel, visual editor, and translation management.

### What you get

- **Admin panel** at `/admin` — manage blog posts, legal pages, and translations
- **Visual editor** at `/admin/visual` — click any text on the live site to edit it
- **Translation singletons** — auto-generated admin forms for every page's translations
- **Media library** — upload and manage images through the admin panel

### How it works

The CMS is configured in `saastrocms.config.ts`:

```ts
const config = {
  github: { owner: 'your-user', repo: 'your-site' },
  i18n: {
    locales: ['en', 'es'],
    defaultLocale: 'en',
    translationsPath: 'src/i18n/translations',
    format: 'json',
    singletonPages: true,
    sharedPrefixes: ['nav', 'footer', 'cookieBanner'],
  },
  collections: {
    blog: { name: 'Blog', icon: 'pen-line' },
    legal: { name: 'Legal Pages', icon: 'scale', i18n: true },
  },
  visualEditor: { enabled: true },
};
```

### Stega encoding and the visual editor

The visual editor uses **stega encoding** — invisible Unicode characters embedded in translated strings — to identify which translation key each text element belongs to. This means:

- **No data attributes** needed on your HTML elements
- **No component wrappers** — translations carry their own identity
- **Zero cost for visitors** — encoding only happens during editor sessions
- **Works through any rendering** — React islands, SSR, hydration

The middleware in `src/middleware.ts` handles this automatically:

```ts
import { encodeTranslations, shouldEncodeForRequest } from '@saastro/cms/stega';

// Only encode when the visual editor is active
const isEditorSession =
  shouldEncodeForRequest(cookieHeader) ||
  context.url.searchParams.has('__saastrocms_visual');

const t = isEditorSession
  ? encodeTranslations(rawTranslations, lang)
  : rawTranslations;
```

When an editor clicks text in the visual editor, the bridge script decodes the invisible characters to find the translation key (e.g., `hero.title`), opens a property panel, and stages the edit. All changes are committed to GitHub in a single batch on save.

### The `fieldPrefix` prop

Components accept a `fieldPrefix` prop that tells the CMS page scanner which translation keys they use. This drives automatic singleton generation:

```astro
<!-- index.astro -->
<Hero
  title={hero.title}
  subtitle={hero.subtitle}
  fieldPrefix="hero"
/>
```

The scanner reads all `.astro` pages, finds `fieldPrefix` props, cross-references them with the translation JSON, and generates admin forms with the correct field types (text, textarea, array, etc.).

Components that appear on every page (Header, Footer) use `sharedPrefixes` in the config to avoid duplicating their fields across every page singleton.

| Component | `fieldPrefix` | Singleton |
|-----------|--------------|-----------|
| Hero | `"hero"` | Home (page-specific) |
| AboutContent | `"about"` | About (page-specific) |
| Header | `"nav"` | Shared (via `sharedPrefixes`) |
| Footer | `"footer"` | Shared (via `sharedPrefixes`) |

### Without the CMS

To use this theme without the CMS:

1. Remove `@saastro/cms` and `@saastro/editor` from `package.json`
2. Remove the `saastrocms()` integration from `astro.config.mjs`
3. Remove the stega import from `src/middleware.ts`
4. Delete `saastrocms.config.ts`

The theme continues to work — translations still load from JSON, pages still render, i18n still works. You just lose the admin panel and visual editor.

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
npx shadcn@latest add card dialog dropdown-menu table
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
| `bun install` | Install dependencies |
| `bun run dev` | Dev server at localhost:4930 |
| `bun run build` | Build to `dist/` |
| `bun run preview` | Preview production build |
| `npx shadcn@latest add [component]` | Add shadcn components |

## Deploy to Cloudflare Pages

This project is configured for **Cloudflare Pages with SSR** (server-rendered routes via `_worker.js`). Pages that can be static (blog posts, legal pages) are prerendered at build time. The rest (home, about, etc.) go through the middleware for i18n.

### Setup

1. Connect the GitHub repo (`saastro-io/saastro-theme`) to Cloudflare Pages
2. Configure the following settings:

#### Build configuration

| Field | Value |
|-------|-------|
| Build command | `bun install && bun run build` |
| Build output directory | `dist` |
| Root directory | `/` |

#### Environment variables

| Variable | Value | Why |
|----------|-------|-----|
| `NODE_VERSION` | `22` | Astro 6 requires Node 18+ |
| `BUN_VERSION` | `1.3.11` | **Must match the lockfile format.** Without this, CF Pages uses npm, ignores `bun.lock`, and resolves different dependency versions — causing `require_dist is not a function` errors in the workerd module runner |

#### Runtime settings (Settings > Functions)

| Field | Value |
|-------|-------|
| Compatibility date | `2025-04-01` (or later) |
| Compatibility flags | `nodejs_compat` |

### Known issues and gotchas

#### `require_dist is not a function`

**Cause**: CF Pages defaulted to npm for dependency installation. npm without a lockfile resolves different dependency versions than bun. The different dependency tree produces a broken CJS bundle for the workerd SSR runner.

**Fix**: Set `BUN_VERSION` environment variable so CF Pages uses `bun install` with your `bun.lock`. This ensures the dependency tree is identical to local.

#### `The name 'ASSETS' is reserved in Pages projects`

**Cause**: The `@astrojs/cloudflare` adapter generates an internal `wrangler.json` with an `ASSETS` binding. If your `wrangler.toml` contains `pages_build_output_dir`, wrangler validates bindings with Pages-specific rules and rejects `ASSETS`.

**Fix**: Do **not** commit a `wrangler.toml` to the repo. The adapter generates its own config at build time. Set compatibility flags via the CF Pages dashboard instead. The `.gitignore` already excludes `wrangler.toml`.

#### `module is not defined` in dev mode

**Cause**: The Cloudflare adapter's workerd runner conflicts with Vite's dev server.

**Fix**: Already handled — `astro.config.mjs` only loads the Cloudflare adapter in production builds. In dev, Astro uses its default Node server.

#### CF Pages ignores `wrangler.toml` without `pages_build_output_dir`

CF Pages logs: `A Wrangler configuration file was found but it does not appear to be valid`. This is expected — the adapter's internal `wrangler.json` in `dist/_worker.js/` is what CF Pages actually uses for deployment. Your repo does not need a `wrangler.toml`.

#### bun lockfile version mismatch

If you see `Unknown lockfile version` in the CF Pages build log, your `BUN_VERSION` is too old. `bun.lock` (text format) was introduced in bun 1.2+. Versions below 1.2 use `bun.lockb` (binary). Set `BUN_VERSION` to match your local bun version (`bun --version`).

### How the build works

```
bun install          → installs deps using bun.lock (exact versions)
astro build          → compiles Astro, generates dist/ with:
                        - Static HTML for prerendered pages (/blog/*, /legal/*)
                        - _worker.js/ for SSR routes (middleware, dynamic pages)
echo '...' > index.js → creates _worker.js/index.js entry point for CF Pages
```

CF Pages detects `_worker.js/` in the output and deploys it as a Pages Function. Static files are served directly from the CDN. SSR routes go through the worker.

### Deploy to other hosts

For non-Cloudflare hosts, swap the adapter in `astro.config.mjs`:

```bash
npx astro add vercel    # Vercel
npx astro add netlify   # Netlify
npx astro add node      # Any Node.js server
```

## License

MIT
