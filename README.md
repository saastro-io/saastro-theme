# Saastro Theme

Standalone Astro template with shadcn/ui. Zero private dependencies — works out of the box for any project.

## Tech Stack

- **Astro 6** (static + SSR-ready)
- **React 19** (interactive islands)
- **Tailwind CSS 4** (oklch tokens, dark mode)
- **shadcn/ui** (Nova preset, Geist font, Radix primitives)
- **Zustand** (lightweight state for widgets)
- **astro-icon** + Tabler + Lucide icons

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
│   ├── Logo.astro                # Light/dark logo with fallback initials
│   ├── ToggleTheme.astro         # Light/dark/system toggle (anti-FOUC)
│   ├── DesktopMenu.tsx           # shadcn NavigationMenu with dropdowns
│   ├── MobileMenu.tsx            # shadcn Sheet + Accordion for mobile nav
│   ├── LocaleSelector.tsx        # EN / ES locale switcher (opt-in)
│   ├── Analytics.astro           # GA4 + GTM (consent-aware, reads cookie)
│   ├── AnalyticsNoscript.astro   # GTM noscript fallback
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
│   ├── 404.astro                 # Error page
│   ├── blog/
│   │   ├── index.astro           # Blog listing (grid with badges, dates, tags)
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
3. Injects `lang`, `t`, `localePath` into `Astro.locals`
4. Rewrites URL to strip prefix (`/es/about` -> `/about`)
5. Pages access translations via `Astro.locals.t`

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

## Deploy

Build produces a static `dist/` folder. Deploy to any static host:

- **Cloudflare Pages**: `bun run build` + deploy `dist/`
- **Vercel**: framework preset Astro
- **Netlify**: build command `bun run build`, publish `dist/`
- **GitHub Pages**: use `@astrojs/starlight` action or manual deploy

For SSR (i18n middleware on every request), add a server adapter:

```bash
npx astro add cloudflare  # or node, vercel, netlify
```

## License

MIT
