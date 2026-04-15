// Requires @astrojs/rss — install with: bun add @astrojs/rss

import type { APIContext } from 'astro';
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context: APIContext) {
  const posts = await getCollection('blog');

  const sortedPosts = [...posts].sort(
    (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
  );

  return rss({
    title: 'Saastro Blog',
    description: 'Latest posts from Saastro',
    site: context.site!.toString(),
    items: sortedPosts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: new Date(post.data.date),
      link: `/blog/${post.id}/`,
    })),
  });
}
