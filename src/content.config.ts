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

export const collections = { legal, blog };
