import Link from 'next/link';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ProjectCards } from '@/components/project-cards';
import { StructuredData } from '@/components/structured-data';
import { getPublishedProjects } from '@/lib/server/projects';
import { absoluteUrl, pageMetadata, siteOrigin } from '@/lib/seo';
import { services } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({ title: 'Completed Home & Garden Projects', description: 'Explore GNJ garden, patio, flooring and bathroom projects with photographs and project details. Serving Huntingdon, Huntingdonshire and locations within 50 miles.', path: '/projects' });

export default async function ProjectsPage() {
  // A backend failure must not turn the full index into a successful empty page.
  const projects = await getPublishedProjects();
  const schema = siteOrigin() ? { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Completed GNJ projects', url: absoluteUrl('/projects'), mainEntity: { '@type': 'ItemList', itemListElement: projects.map((project, index) => ({ '@type': 'ListItem', position: index + 1, name: project.title, url: absoluteUrl(`/projects/${project.slug}`) })) } } : null;
  return <><Header /><main id="main" className="container seo-page"><Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Projects', path: '/projects' }]} /><StructuredData data={schema} />
    <header className="seo-intro"><p className="eyebrow">COMPLETED GNJ WORK</p><h1>Home & garden <em>project gallery.</em></h1><p>Explore the photographs and details of our published projects. Follow a project to see more images and any before-and-after comparisons or videos available.</p></header>
    {services.map(service => {
      const related = projects.filter(project => project.category === service.category);
      return <section key={service.slug} className="seo-section" aria-labelledby={`projects-${service.slug}`}><h2 id={`projects-${service.slug}`}>{service.category}</h2><p><Link href={`/services/${service.slug}`}>About our {service.category.toLowerCase()} services</Link></p>{related.length ? <ProjectCards projects={related} /> : <p>We are gathering more photographs for this category. <Link href="/contact">Contact us to discuss your project.</Link></p>}</section>;
    })}
  </main><Footer /></>;
}
