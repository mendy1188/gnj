import type { Metadata } from 'next';
import '@fontsource-variable/cormorant-garamond';
import '@fontsource-variable/dm-sans';
import './globals.css';
import { business } from '@/lib/content';
import { businessSchema, indexingEnabled, siteOrigin } from '@/lib/seo';
import { StructuredData } from '@/components/structured-data';

const siteUrl = siteOrigin();
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl || 'http://localhost:3000'),
  title: { default: 'Home & Garden Improvements in Huntingdon | GNJ', template: '%s | GNJ' },
  description: business.introduction,
  openGraph: { title: business.name, description: business.introduction, type: 'website', locale: 'en_GB', images: [{ url: '/images/gnj-logo.jpg', width: 1024, height: 1004, alt: business.name }] },
  twitter: { card: 'summary', title: business.name, description: business.introduction, images: ['/images/gnj-logo.jpg'] },
  icons: { icon: '/icon.svg', apple: '/images/gnj-logo.jpg' },
  robots: { index: indexingEnabled(), follow: true },
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-GB" data-scroll-behavior="smooth"><body><StructuredData data={businessSchema()} />{children}</body></html>;
}
