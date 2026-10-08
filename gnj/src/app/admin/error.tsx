'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';

export default function AdminError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return <main className="admin-login"><Link href="/" className="admin-back"><ArrowLeft size={16} /> Back to the website</Link><div className="admin-login-card"><span className="admin-wordmark">GNJ<span>OWNER DASHBOARD</span></span><p className="admin-eyebrow">LET’S TRY THAT AGAIN</p><h1>A brief interruption.</h1><p className="admin-muted">We couldn’t open the owner dashboard. Check your connection and try again. If this continues, check that the database setup is complete.</p><div className="admin-notice"><button className="admin-button" onClick={() => { router.refresh(); reset(); }}><RefreshCw size={16} /> Try again</button></div></div></main>;
}
