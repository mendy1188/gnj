import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, MapPin } from 'lucide-react';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { ProjectGallery } from '@/components/project-gallery';
import { ProjectVideos } from '@/components/project-videos';
import '@/components/project-videos.css';
import { Comparison } from '@/components/comparison';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { StructuredData } from '@/components/structured-data';
import { pageMetadata, projectSchema } from '@/lib/seo';
import { serviceForCategory } from '@/lib/services';
import { getPublishedProject } from '@/lib/server/projects';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await getPublishedProject((await params).slug);
  if (!project) notFound();
  const cover = project.images.find(image => image.id === project.cover_image_id) || project.images[0];
  return pageMetadata({ title: `${project.title}${project.location ? ` in ${project.location}` : ''} — ${project.category}`, description: project.description || `Explore photographs of ${project.title}, a ${project.category.toLowerCase()} project by GNJ.`, path: `/projects/${project.slug}`, ...(cover ? { image: cover.url, imageAlt: cover.alt || project.title } : {}) });
}
export default async function ProjectPage({ params }: Props) {
  const project = await getPublishedProject((await params).slug);
  if (!project) notFound();
  const service = serviceForCategory(project.category);
  return <><Header/><main id="main" className="container project-page"><Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Projects', path: '/projects' }, { name: project.title, path: `/projects/${project.slug}` }]} /><StructuredData data={projectSchema(project)} /><Link className="back-link" href="/projects"><ArrowLeft size={16}/> Back to our work</Link><div className="project-page-heading"><div><p className="eyebrow">{project.category.toUpperCase()}</p><h1>{project.title}</h1>{project.location && <p className="project-location"><MapPin size={14}/>{project.location}</p>}</div><p className="project-description">{project.description}</p></div><ProjectGallery images={project.images} projectTitle={project.title}/><ProjectVideos videos={project.videos}/>{project.comparisons.length > 0 && <section className="project-comparisons" aria-labelledby="comparisons-heading"><p className="eyebrow">THE DIFFERENCE IN THE DETAILS</p><h2 id="comparisons-heading">Before <em>and after.</em></h2>{project.comparisons.map(pair => <Comparison key={pair.id} pair={pair} images={project.images}/>)}</section>}<section className="seo-section"><h2>Planning a similar improvement?</h2><p>Learn more about <Link href={`/services/${service.slug}`}>{service.title.toLowerCase()}</Link>, including what to consider before requesting a quote.</p><Link href="/projects">Explore more GNJ projects</Link></section><div className="project-end-cta"><h2>Something in mind <em>for your home?</em></h2><Link className="button button-primary" href="/#contact">Request a Free Consultation <ArrowUpRight size={18}/></Link></div></main><Footer/></>;
}
