# Deploy — Cloudflare Workers Builds (token-free)

This theme deploys as a **Cloudflare Worker** (SSR via `@astrojs/cloudflare`).
Deployment is **wired by the Saastro Hub**, not by a workflow in this repo — and
crucially, **there is no Cloudflare token in this repo**.

## How it works

When a new site is created from this template (Hub → *New site from template*),
the Hub connects the generated repo to **Cloudflare Workers Builds** (Cloudflare's
git-integration) using the Hub's own credentials. From then on, **every push to
`main` makes Cloudflare build and deploy the Worker** — Cloudflare's GitHub App
reads the repo read-only; no secret ever lands here.

```
git push main ──▶ Cloudflare Workers Builds ──▶  pnpm build (astro build)
                                            └──▶  wrangler deploy --config dist/server/wrangler.json
                                                       └──▶  <site>.workers.dev  (live)
```

What the Hub does once, at site creation:

1. Rewrites `wrangler.jsonc` → `name` = the site slug (Cloudflare requires the
   Worker name to equal the wrangler `name`). The `@astrojs/cloudflare` adapter
   inherits that `name` into the emitted `dist/server/wrangler.json`, so the
   deploy targets the right Worker.
2. Creates a placeholder Worker, connects the repo, and registers a build trigger
   (build + deploy commands come from `saastro.template.json`).
3. Kicks the first build.

The build/deploy commands live in **`saastro.template.json`**:

```json
"deploy": {
  "provider": "cf_workers",
  "buildCommand": "pnpm build",
  "deployCommand": "npx wrangler deploy --config dist/server/wrangler.json",
  "wranglerConfig": "wrangler.jsonc"
}
```

## Why no `.github/workflows/deploy.yml`

The old workflow needed a `CLOUDFLARE_API_TOKEN` **secret in every client repo** —
exactly what the token-free model removes. It was deleted; a workflow here would
also double-deploy. **CI (`.github/workflows/ci.yml`) stays** — it only runs
`pnpm studio:check` and needs no secrets.

## Operator prerequisites (one-time, on the Hub side — not in this repo)

These are configured **once per Cloudflare account** on the Hub, never here:

1. **CF ↔ GitHub App connection** — install *"Cloudflare Workers and Pages"* on the
   GitHub org (CF dashboard → Workers & Pages → Builds → Connect), with access to
   **all repositories** (so freshly-created site repos are visible).
2. **`CF_BUILDS_TOKEN`** — a user-scoped Cloudflare API token with
   *Workers Scripts: Edit* + *Workers Builds Configuration: Edit*.
3. **`CF_BUILD_TOKEN_UUID`** — the uuid of a **dashboard-minted** build token.
   Build tokens created via the API are rejected by the build runner
   (*"build token … rolled"*); only a token minted by the dashboard
   git-integration works. Connect any one repo via the dashboard once to mint a
   reusable token (one token drives every site; reusing it does not break the
   original), then put its uuid in the Hub env.

When those aren't configured, site creation still works — it just leaves the
"Connect the deploy" onboarding task instead of auto-deploying.

## Deploying manually (rare)

You normally never run this — Cloudflare does it on push. But to deploy by hand:

```bash
pnpm build
npx wrangler deploy --config dist/server/wrangler.json
```

(`pnpm build` emits `dist/server/wrangler.json`; the adapter derives it from the
root `wrangler.jsonc`, inheriting the Worker `name`.)
