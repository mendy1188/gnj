import type { MetadataRoute } from 'next';
import { absoluteUrl, indexingEnabled } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  if (!indexingEnabled()) return { rules: { userAgent: '*', disallow: '/' } };
  return { rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/'] }, sitemap: absoluteUrl('/sitemap.xml') };
}
