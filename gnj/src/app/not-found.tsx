import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
export default function NotFound() { return <><Header/><main id="main" className="container not-found"><p className="eyebrow">A SMALL DETOUR</p><h1>This page isn’t here.</h1><p>The project may no longer be available, or the link may have changed.</p><Link href="/#work" className="button button-primary"><ArrowLeft size={17}/> Explore our work</Link></main><Footer/></>; }
