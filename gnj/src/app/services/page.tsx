import Link from 'next/link';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { business } from '@/lib/content';
import { services } from '@/lib/services';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({ title: 'Home & Garden Improvement Services in Huntingdon', description: 'Garden landscaping, patios, flooring, bathroom renovations and plumbing in Huntingdon, Huntingdonshire and within 50 miles. Explore GNJ services and completed work.', path: '/services' });

export default function ServicesPage() {
  return <><Header /><main id="main" className="container seo-page">
    <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Services', path: '/services' }]} />
    <header className="seo-intro"><p className="eyebrow">HOME & GARDEN IMPROVEMENTS</p><h1>Our services in Huntingdon <em>and the surrounding area.</em></h1>
      <p>Explore practical improvements for your garden and the rooms inside your home. Each service page explains the work, what to consider and how to get started.</p><p>Serving {business.serviceArea}.</p></header>
    <div className="services-grid">{services.map(service => <article className="service" key={service.slug}><h2><Link href={`/services/${service.slug}`}>{service.title}</Link></h2><p>{service.summary}</p><Link className="text-link" href={`/services/${service.slug}`}>Explore {service.category.toLowerCase()}</Link></article>)}</div>
    <section className="seo-section"><h2>See the work, then discuss your project</h2><p>Browse photographs and descriptions of <Link href="/projects">completed GNJ projects</Link>, then tell us about the changes you have in mind. We can discuss the work and what is needed to prepare a quote.</p><Link className="button button-primary" href="/contact">Request a Free Consultation</Link></section>
  </main><Footer /></>;
}
