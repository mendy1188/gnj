import type { Metadata } from 'next';
import '@fontsource-variable/cormorant-garamond';
import '@fontsource-variable/dm-sans';
import './globals.css';
import { business } from '@/lib/content';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl || 'http://localhost:3000'),
  title: { default: 'GNJ Home & Garden Improvement | Beautiful improvements. Inside and out.', template: '%s | GNJ Home & Garden Improvement' },
  description: business.introduction,
  openGraph: { title: business.name, description: business.introduction, type: 'website', locale: 'en_GB', images: [{ url: '/images/gnj-logo.jpg', width: 1024, height: 1004, alt: business.name }] },
  twitter: { card: 'summary', title: business.name, description: business.introduction, images: ['/images/gnj-logo.jpg'] },
  icons: { icon: '/icon.svg', apple: '/images/gnj-logo.jpg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const schema = { '@context': 'https://schema.org', '@type': 'HomeAndConstructionBusiness', name: business.name, email: business.email, telephone: business.phone, ...(siteUrl ? { url: siteUrl } : {}), ...(business.serviceArea ? { areaServed: business.serviceArea } : {}) };
  return <html lang="en-GB" data-scroll-behavior="smooth"><body><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />{children}</body></html>;
}
