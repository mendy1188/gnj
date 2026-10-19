import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { StructuredData } from '@/components/structured-data';
import { ProjectCards } from '@/components/project-cards';
import { business } from '@/lib/content';
import { services } from '@/lib/services';
import { absoluteUrl, pageMetadata, siteOrigin } from '@/lib/seo';
import { getPublishedProjects } from '@/lib/server/projects';
import type { Project } from '@/lib/types';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const selected = services.find(item => item.slug === slug);
  if (!selected) notFound();
  return pageMetadata({ title: `${selected.title} in Huntingdon`, description: selected.summary, path: `/services/${selected.slug}` });
}

export default async function ServicePage({ params }: Props) {
  const { slug } = await params;
  const service = services.find(item => item.slug === slug);
  if (!service) notFound();
  let projects: Project[] = [], unavailable = false;
  try { projects = (await getPublishedProjects()).filter(project => project.category === service.category); } catch { unavailable = true; }
  const path = `/services/${service.slug}`;
  const schema = siteOrigin() ? { '@context': 'https://schema.org', '@type': 'Service', '@id': `${absoluteUrl(path)}#service`, name: service.title, serviceType: service.category, description: service.summary, url: absoluteUrl(path), areaServed: business.serviceArea, provider: { '@id': `${siteOrigin()}/#business` } } : null;
  return <><Header /><main id="main" className="container seo-page">
    <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Services', path: '/services' }, { name: service.title, path }]} /><StructuredData data={schema} />
    <header className="seo-intro"><p className="eyebrow">GNJ SERVICES · HUNTINGDON</p><h1>{service.title} <em>in Huntingdon.</em></h1><p>{service.introduction}</p><p>Serving {business.serviceArea}.</p><Link href="/contact" className="button button-primary">Discuss your {service.category.toLowerCase()} project</Link></header>
    <section className="seo-section" aria-labelledby="service-work"><h2 id="service-work">How we can help</h2><div className="seo-detail-grid">{service.work.map(work => <article key={work.title}><h3>{work.title}</h3><p>{work.description}</p></article>)}</div></section>
    <section className="seo-section"><h2>Preparing for your consultation</h2><p>{service.preparation}</p><p>Include your town or postcode so we can confirm the location and discuss arrangements for your project.</p></section>
    <section className="seo-section" aria-labelledby="related-projects"><h2 id="related-projects">{service.category} projects</h2>
      {projects.length ? <ProjectCards projects={projects.slice(0, 6)} /> : <p>{unavailable ? 'Project photographs are temporarily unavailable. Please contact us to discuss examples of our work.' : 'Contact us to discuss your plans and ask about examples relevant to your project.'}</p>}
      <Link className="text-link" href="/projects">Browse all completed projects</Link>
    </section>
    <section className="seo-section"><h2>Questions about {service.category.toLowerCase()}</h2>{service.questions.map(item => <div className="seo-question" key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></div>)}</section>
    <section className="seo-section"><h2>Related home improvement services</h2><ul>{services.filter(item => item.slug !== slug).map(item => <li key={item.slug}><Link href={`/services/${item.slug}`}>{item.title}</Link></li>)}</ul><Link className="button button-primary" href="/contact">Request a Free Consultation</Link></section>
  </main><Footer /></>;
}
