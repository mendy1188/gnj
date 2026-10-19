import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { business } from '@/lib/content';

export function Footer() {
  return <footer className="site-footer"><div className="container"><div className="footer-top"><Link className="footer-brand" href="/"><Image src="/images/gnj-logo.jpg" width={100} height={98} alt="GNJ Home & Garden Improvement" /><span>Thoughtful improvements.<br /><em>A home to love.</em></span></Link><div className="footer-links"><Link href="/services">Our services</Link><Link href="/projects">Our work</Link><Link href="/#about">About GNJ</Link><Link href="/contact">Contact & service area</Link></div><div className="footer-contact"><a href={business.phoneHref}>{business.phone} <ArrowUpRight size={15}/></a><a href={`mailto:${business.email}`}>{business.email}</a></div></div><div className="footer-bottom"><p>© {new Date().getFullYear()} GNJ Home & Garden Improvement</p><div><Link href="/privacy">Privacy</Link><Link href="/admin">Owner sign in <ArrowUpRight size={12}/></Link></div></div></div></footer>;
}
