import type { APIContext } from 'astro';

export function GET(context: APIContext) {
  const siteUrl = context.site ?? new URL('https://yourname.dev');
  const body = `User-agent: *
Allow: /

Sitemap: ${new URL('sitemap-index.xml', siteUrl).href}
`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
