'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Menu, X } from 'lucide-react';

export function Header({ onHome = false }: { onHome?: boolean }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const prefix = onHome ? '' : '/';
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);
  return <><a className="skip-link" href="#main">Skip to content</a><header className="site-header"><div className="container header-inner">
    <Link href="/" className="brand" aria-label="GNJ Home & Garden Improvement home"><Image src="/images/gnj-logo.jpg" width={124} height={122} priority alt="GNJ Home & Garden Improvement" /></Link>
    <button ref={button} className="menu-toggle" aria-expanded={open} aria-controls="main-navigation" aria-label={open ? 'Close navigation' : 'Open navigation'} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
    <nav id="main-navigation" className={`main-navigation ${open ? 'is-open' : ''}`} aria-label="Main navigation">{[['Services','services'],['Our Work','work'],['About','about'],['Contact','contact']].map(([label,id]) => <Link onClick={() => setOpen(false)} key={id} href={`${prefix}#${id}`}>{label}</Link>)}<Link onClick={() => setOpen(false)} href={`${prefix}#contact`} className="button button-header">Request a Free Consultation <ArrowUpRight size={16} /></Link></nav>
  </div></header></>;
}
