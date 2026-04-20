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

To remove the CMS and run the theme as a fully static site:

#### 1. Remove CMS dependencies

```bash
bun remove @saastro/cms @saastro/editor @astrojs/cloudflare
```

#### 2. Update `astro.config.mjs`

Remove the cloudflare adapter, session config, and CMS integration:

```js
// @ts-check
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://your-site.com/',
  output: 'static',  // back to static
  integrations: [react(), sitemap(), icon()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: [
        'use-sync-external-store/shim/index.js',
        'use-sync-external-store/shim/with-selector.js',
      ],
    },
    resolve: {
      alias: { '@': '/src' },
      dedupe: ['react', 'react-dom'],
    },
  },
});
```

#### 3. Simplify `src/middleware.ts`

Remove the CMS auth and stega encoding — keep only i18n:

```ts
import { defineMiddleware } from 'astro:middleware';
import { i18nConfig } from './i18n/config';
import { getLocaleFromUrl, getTranslations, localePath } from './i18n/utils';

export const onRequest = defineMiddleware(async (context, next) => {
  if (!i18nConfig.enabled) return next();
  if (context.locals.lang) return next();

  const lang = getLocaleFromUrl(context.url.pathname);
  context.locals.lang = lang;
  context.locals.t = getTranslations(lang);
  context.locals.localePath = (path: string) => localePath(lang, path);

  if (lang !== i18nConfig.defaultLocale) {
    const stripped = context.url.pathname.replace(`/${lang}`, '') || '/';
    return context.rewrite(stripped);
  }

  return next();
});
```

#### 4. Delete CMS-specific files

```bash
rm saastrocms.config.ts
rm wrangler.jsonc
rm -rf .github/workflows/deploy.yml   # if using CF Pages git integration instead
```

#### 5. Update `package.json` scripts

```json
{
  "scripts": {
    "dev": "astro dev --port 4930",
    "build": "astro build",
    "preview": "astro preview"
  }
}
```

That's it. Translations still load from JSON, i18n still works, all pages render normally. You can deploy the `dist/` output to any static host (Cloudflare Pages git integration, Netlify, Vercel, GitHub Pages).

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

This project uses **`@astrojs/cloudflare` v13** which outputs a Workers model (`dist/server/` + `dist/client/`). CF Pages git integration cannot deploy this — it requires **GitHub Actions** with `wrangler pages deploy`.

### How it works

Every push to `main` triggers `.github/workflows/deploy.yml`:

```
git push → GitHub Actions
  → bun install
  → bun run build         (generates dist/server/ + dist/client/)
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

CF Pages → `saastro-theme` → Settings → Builds & deployments → **Pause deployments**.

This prevents CF Pages from trying to build via git integration (it would fail without the worker).

#### 5. Configure KV bindings in CF Pages

CF Pages → `saastro-theme` → Settings → Functions → KV namespace bindings:

| Variable name | KV namespace |
|---------------|-------------|
| `KV` | your KV namespace |

### Why not CF Pages git integration?

`@astrojs/cloudflare` v13 generates a Workers-model output (`main` + `assets` binding). CF Pages git integration only uploads static assets — it has no way to deploy the worker. Without the worker, all HTML routes return 404.

See [withastro/astro#15802](https://github.com/withastro/astro/issues/15802) for a related known issue (SESSION KV binding injected even when sessions are unused — fixed in v13.1.10 by setting `session.driver` to null in `astro.config.mjs`).

### Can I skip GitHub Actions and deploy straight from GitHub?

Not with the CMS enabled. Here's why:

| Deployment option | Works without CMS (static) | Works with CMS (SSR/Workers) |
|---|---|---|
| CF Pages git integration | ✅ Yes | ❌ No |
| GitHub Actions + Wrangler | ✅ Yes | ✅ Yes |
| CF Workers Builds (beta) | ✅ Yes | ⚠️ Possible but experimental |

The CMS requires SSR (`output: 'server'`), which means `@astrojs/cloudflare` outputs a Workers model. CF Pages git integration only handles static assets — it cannot deploy the worker, so all HTML routes return 404.

**GitHub Actions is the supported path when the CMS is active.** If you remove the CMS and go static (see [Without the CMS](#without-the-cms)), you can use CF Pages git integration directly with no Actions required.

### Manual deploy (emergency)

```bash
bun run build
npx wrangler pages deploy dist/client --project-name saastro-theme --branch main
```

Requires `wrangler login` first.

### Deploy to other hosts

Swap the adapter in `astro.config.mjs`:

```bash
npx astro add vercel    # Vercel
npx astro add netlify   # Netlify
npx astro add node      # Any Node.js server
```

## License

MIT
