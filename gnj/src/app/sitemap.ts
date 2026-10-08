import type { MetadataRoute } from 'next';
import { getPublishedProjects } from '@/lib/server/projects';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> { const url = process.env.NEXT_PUBLIC_SITE_URL; if (!url) return []; let projects: Awaited<ReturnType<typeof getPublishedProjects>> = []; try { projects = await getPublishedProjects(); } catch { /* Keep static site links available during a portfolio outage. */ } return [{ url, priority: 1 }, { url: `${url}/privacy`, priority: .2 }, ...projects.map(p => ({ url: `${url}/projects/${p.slug}`, ...(p.updated_at ? { lastModified: p.updated_at } : {}), priority: .7 }))]; }
