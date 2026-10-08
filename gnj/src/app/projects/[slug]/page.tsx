import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, MapPin } from 'lucide-react';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { ProjectGallery } from '@/components/project-gallery';
import { Comparison } from '@/components/comparison';
import { getPublishedProject } from '@/lib/server/projects';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await getPublishedProject((await params).slug);
  if (!project) return { title: 'Project not found' };
  const cover = project.images.find(image => image.id === project.cover_image_id) || project.images[0];
  return { title: project.title, description: project.description, openGraph: { title: project.title, description: project.description, ...(cover ? { images: [{ url: cover.url, alt: cover.alt }] } : {}) } };
}
export default async function ProjectPage({ params }: Props) {
  const project = await getPublishedProject((await params).slug);
  if (!project) notFound();
  return <><Header/><main id="main" className="container project-page"><Link className="back-link" href="/#work"><ArrowLeft size={16}/> Back to our work</Link><div className="project-page-heading"><div><p className="eyebrow">{project.category.toUpperCase()}</p><h1>{project.title}</h1>{project.location && <p className="project-location"><MapPin size={14}/>{project.location}</p>}</div><p className="project-description">{project.description}</p></div><ProjectGallery images={project.images}/>{project.comparisons.length > 0 && <section className="project-comparisons" aria-labelledby="comparisons-heading"><p className="eyebrow">THE DIFFERENCE IN THE DETAILS</p><h2 id="comparisons-heading">Before <em>and after.</em></h2>{project.comparisons.map(pair => <Comparison key={pair.id} pair={pair} images={project.images}/>)}</section>}<div className="project-end-cta"><h2>Something in mind <em>for your home?</em></h2><Link className="button button-primary" href="/#contact">Request a Free Consultation <ArrowUpRight size={18}/></Link></div></main><Footer/></>;
}
