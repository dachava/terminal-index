import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = (await getCollection('blog', ({ data }) => !data.draft))
    .map(post => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/blog/${post.id}/`,
      categories: post.data.tags,
    }));

  const tils = (await getCollection('til'))
    .map(til => ({
      title: `TIL: ${til.data.title}`,
      pubDate: til.data.pubDate,
      description: undefined,
      link: `/til/${til.id}/`,
      categories: til.data.tags,
    }));

  const items = [...posts, ...tils]
    .sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());

  return rss({
    title: 'dachava.dev',
    description: 'Infrastructure, cloud, and AI — field notes from the terminal.',
    site: context.site!,
    items,
    customData: '<language>en-us</language>',
  });
}
