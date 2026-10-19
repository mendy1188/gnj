import type { Metadata, MetadataRoute } from 'next';
import { business } from './content';
import { services } from './services';
import type { Project } from './types';

export function siteOrigin(value = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.gnjgarden.com'): string | undefined {
  if (!value?.trim()) return undefined;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('NEXT_PUBLIC_SITE_URL must be the public HTTP(S) origin, without a path, query or credentials.');
  }
  return url.origin;
}

export function indexingEnabled(origin = siteOrigin()) {
  if (!origin || process.env.SEO_NOINDEX === 'true' || process.env.VERCEL_ENV === 'preview') return false;
  const host = new URL(origin).hostname;
  return !['localhost', '127.0.0.1', '[::1]'].includes(host) && !host.endsWith('.localhost');
}

export function absoluteUrl(path: string, origin = siteOrigin()) {
  return origin ? new URL(path, origin).href : undefined;
}

export function pageMetadata({ title, description, path, image = '/images/garden.webp', imageAlt = 'Completed GNJ garden improvement' }: {
  title: string; description: string; path: string; image?: string; imageAlt?: string;
}): Metadata {
  const url = absoluteUrl(path);
  return {
    title, description,
    ...(url ? { alternates: { canonical: url } } : {}),
    robots: { index: indexingEnabled(), follow: true, googleBot: { index: indexingEnabled(), follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
    openGraph: { title, description, url, siteName: business.name, locale: 'en_GB', type: 'website', images: [{ url: image, alt: imageAlt }] },
    twitter: { card: 'summary_large_image', title, description, images: [{ url: image, alt: imageAlt }] },
  };
}

export function jsonLd(value: unknown) { return JSON.stringify(value).replace(/</g, '\\u003c'); }

export function breadcrumbs(items: { name: string; path: string }[]) {
  if (!siteOrigin()) return null;
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: absoluteUrl(item.path) })) };
}

export function businessSchema() {
  const origin = siteOrigin();
  if (!origin) return null;
  return {
    '@context': 'https://schema.org', '@type': 'HomeAndConstructionBusiness', '@id': `${origin}/#business`,
    name: business.name, url: origin, description: business.introduction,
    email: business.email, telephone: business.phone, logo: absoluteUrl('/images/gnj-logo.jpg'), image: absoluteUrl('/images/garden.webp'),
    areaServed: business.serviceArea,
    hasOfferCatalog: { '@type': 'OfferCatalog', name: 'Home and garden improvement services', itemListElement: services.map(service => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: service.title, url: absoluteUrl(`/services/${service.slug}`) } })) },
  };
}

export function projectSchema(project: Project) {
  if (!siteOrigin()) return null;
  return {
    '@context': 'https://schema.org', '@type': 'CreativeWork', '@id': `${absoluteUrl(`/projects/${project.slug}`)}#project`,
    name: project.title, description: project.description, url: absoluteUrl(`/projects/${project.slug}`),
    creator: { '@id': `${siteOrigin()}/#business` }, genre: project.category,
    image: project.images.map(image => absoluteUrl(image.url)),
    ...(project.location ? { contentLocation: { '@type': 'Place', name: project.location } } : {}),
    ...(project.updated_at ? { dateModified: project.updated_at } : {}),
  };
}

export function sitemapEntries(projects: Project[], origin = siteOrigin()): MetadataRoute.Sitemap {
  if (!origin || !indexingEnabled(origin)) return [];
  const paths = ['/', '/services', ...services.map(service => `/services/${service.slug}`), '/projects', '/contact', '/privacy'];
  return [
    ...paths.map(path => ({ url: new URL(path, origin).href })),
    ...projects.filter(project => project.published).map(project => ({
      url: new URL(`/projects/${project.slug}`, origin).href,
      ...(project.updated_at ? { lastModified: project.updated_at } : {}),
      images: project.images.map(image => new URL(image.url, origin).href),
    })),
  ];
}
