---
title: "Getting started with Saastro Theme"
description: "A quick guide to setting up and customizing your Saastro Theme project."
date: 2026-04-15
author: "Saastro"
tags: ["guide", "setup"]
featured: true
readingTime: 5
---

## Installation

Clone the template and install dependencies:

```bash
bun install
bun run dev
```

## Customization

### Colors

Edit the CSS variables in `src/styles/global.css` to change the color scheme. The theme uses oklch colors with shadcn/ui tokens.

### Components

All UI components come from shadcn/ui. Add more with:

```bash
npx shadcn@latest add card dialog dropdown-menu
```

### i18n

Enable internationalization in `src/i18n/config.ts` by setting `enabled: true` and adding your locales. Translation files live in `src/i18n/translations/`.

## Deployment

Build the static site:

```bash
bun run build
```

Deploy the `dist/` folder to any static host: Cloudflare Pages, Vercel, Netlify, or GitHub Pages.
