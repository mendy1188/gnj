'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, LockKeyhole } from 'lucide-react';
import { adminRequest } from './api';

export function AdminLogin({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await adminRequest('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to connect. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <main className="admin-login">
      <Link href="/" className="admin-back"><ArrowLeft size={16} /> Back to the website</Link>
      <div className="admin-login-card">
        <span className="admin-wordmark">GNJ<span>HOME & GARDEN IMPROVEMENT</span></span>
        <div className="admin-login-icon"><LockKeyhole size={24} strokeWidth={1.4} /></div>
        <p className="admin-eyebrow">A SPACE FOR YOUR BUSINESS</p>
        <h1>Welcome back.</h1>
        <p className="admin-muted">Sign in to share your latest work and manage customer enquiries.</p>
        {!configured ? (
          <div className="admin-notice" role="status">
            <strong>Your dashboard is nearly ready.</strong>
            <p>Connect Supabase and set up the owner account using the project’s setup guide to enable secure sign-in.</p>
          </div>
        ) : (
          <form onSubmit={login} className="admin-form">
            <label>Email address<input name="email" type="email" autoComplete="username" required /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
            {error && <p className="admin-error" role="alert">{error}</p>}
            <button type="submit" className="admin-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowUpRight size={17} /></button>
          </form>
        )}
        <p className="admin-login-note">Private access for the GNJ business owner.</p>
      </div>
    </main>
  );
}
