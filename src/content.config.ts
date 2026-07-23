import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const legal = defineCollection({
  loader: glob({ pattern: '{en,es}/*.md', base: './src/content/legal' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    lastUpdated: z.coerce.date(),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    author: z.string().default('Saastro'),
    image: z.string().optional(),
    imageAlt: z.string().default('Blog post image'),
    tags: z.array(z.string()).optional(),
    featured: z.boolean().optional(),
    readingTime: z.number().optional(),
  }),
});

// lp — one markdown entry per paid-campaign landing page, served at
// /lp/<slug>. The collection is named `lp` ON PURPOSE so collection key,
// content dir and URL prefix all match. Each entry picks its own `layout`
// (from a closed enum, so the client can only choose one that exists) and its
// own `form` (a Hub form slug rendered by <HubForm>). That is the whole point:
// a new landing is a .md the client writes in the Hub — no code, no new
// namespace, no deploy per landing.
// Content lives HERE, in the collection — never as editable Studio i18n.
const lp = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/lp' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string(),
    // SEO overrides for the <title>/<meta description>. Search landings need a
    // title tag written for the SERP, not the on-page H1 (which is longer and
    // punchier). Left empty, SEO falls back to title/subtitle.
    metaTitle: z.string().optional(),
    metaDescription: z.string().optional(),
    eyebrow: z.string().optional(),
    // Which layout renders this landing. A closed enum → the client cannot
    // pick a layout that does not exist. Add a value here + a component in the
    // route's dispatch map to introduce a new one.
    layout: z.enum(['hero-form', 'largo']).default('hero-form'),
    // Hub form slug rendered by <HubForm>. The client designs the form in the
    // Hub and writes its slug here — the landing's lead capture, per landing.
    form: z.string(),
    formTitle: z.string().optional(),
    formNote: z.string().optional(),
    image: z.string().optional(),
    imageAlt: z.string().default(''),
    badge: z.string().optional(),
    // Marketing hook (e.g. "desde 12€/mes"). A claim the client can
    // substantiate — they fill it; left empty it simply does not render.
    priceNote: z.string().optional(),
    // A bullet is either a plain fact (string) or a title+description pair.
    // Both render; the string form keeps punchy one-line facts undistorted.
    bullets: z
      .array(z.union([z.string(), z.object({ title: z.string(), description: z.string() })]))
      .default([]),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    disclaimer: z.string().optional(),
    order: z.number().default(0),
    draft: z.boolean().default(false),
  }),
});

export const collections = { legal, blog, lp };
