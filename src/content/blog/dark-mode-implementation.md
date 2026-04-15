---
title: "How dark mode works in Saastro Theme"
description: "Technical deep-dive into the anti-FOUC dark mode system."
date: 2026-04-14
author: "Saastro"
tags: ["technical", "dark-mode"]
readingTime: 3
---

## The problem

Flash of Unstyled Content (FOUC) happens when the page loads in light mode before JavaScript applies the user's dark mode preference. This causes a visible white flash.

## The solution

Saastro Theme uses an inline script in `<head>` that runs before any content renders:

1. Checks `localStorage` for a saved preference
2. Falls back to `prefers-color-scheme: dark` media query
3. Applies the `dark` class to `<html>` immediately

Because the script is inline and synchronous, it executes before the browser paints — eliminating the flash entirely.

## Toggle behavior

The `ToggleTheme` component cycles through three states:

- **Light** — forces light mode
- **Dark** — forces dark mode
- **System** — follows OS preference

The preference is saved to `localStorage` so it persists across visits.
