import { getSitemapProjects } from '@/lib/server/projects';
import { indexingEnabled, sitemapEntries } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export default async function sitemap() {
  if (!indexingEnabled()) return [];
  // Surface backend errors so crawlers retry instead of accepting a truncated sitemap.
  return sitemapEntries(await getSitemapProjects());
}
