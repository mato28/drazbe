import type { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  return {
    rules: {
      userAgent: '*',
      // /api/public/ serves auction photos (needed for image search and link previews).
      allow: ['/', '/api/public/'],
      disallow: ['/admin', '/upravitelj', '/drazitelj', '/nadzorna-plosca', '/potrditev', '/api/'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
