import { publicService } from '@domik/core';
import type { MetadataRoute } from 'next';
import { serviceContext } from '@/server/services';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  const auctions = await publicService.listPublicAuctionIds(serviceContext());
  return [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/drazbe`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/kako-deluje`, changeFrequency: 'monthly', priority: 0.5 },
    ...auctions.map((a) => ({
      url: `${base}/drazbe/${a.id}`,
      lastModified: a.updatedAt,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}
