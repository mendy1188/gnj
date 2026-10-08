'use client';
import Link from 'next/link';
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main id="main" className="container not-found"><p className="eyebrow">GNJ HOME & GARDEN IMPROVEMENT</p><h1>A little interruption.</h1><p>We couldn’t load this page. Please try again in a moment.</p><button className="button button-primary" onClick={reset}>Try again</button><p><Link href="/">Return home</Link></p></main>; }
