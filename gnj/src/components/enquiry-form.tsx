'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, LoaderCircle } from 'lucide-react';
import { categories } from '@/lib/types';
import { business } from '@/lib/content';

export function EnquiryForm() {
  const startedAt = useRef(0);
  useEffect(() => { startedAt.current = Date.now(); }, []);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const issues: Record<string,string> = {};
    if (!String(data.name || '').trim()) issues.name = 'Please tell us your name.';
    if (!String(data.email || '').trim() && !String(data.phone || '').trim()) issues.email = 'Please add an email address or phone number so we can get back to you.';
    if (!data.service) issues.service = 'Please select a service.';
    if (String(data.message || '').trim().length < 10) issues.message = 'Please tell us a little more (at least 10 characters).';
    setFields(issues);
    if (Object.keys(issues).length) { setStatus('error'); setError('Please check the highlighted fields.'); return; }
    setStatus('loading'); setError('');
    try {
      const response = await fetch('/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, startedAt: startedAt.current || Date.now() - 5000 }) });
      const result = await response.json();
      if (!response.ok) { setFields(result.fields || {}); throw new Error(result.error || 'Your enquiry could not be saved. Please try again.'); }
      setStatus('success');
    } catch (err) { setStatus('error'); setError(err instanceof Error ? err.message : 'Something went wrong. Please try again, or contact us directly.'); }
  }
  if (status === 'success') return <div className="enquiry-success" role="status"><span><Check size={28}/></span><p className="eyebrow">A GOOD PLACE TO START</p><h3>Thank you for getting in touch.</h3><p>Your enquiry has been received. We’ll use the contact details you shared to discuss your project.</p><button className="button button-outline" onClick={() => { setStatus('idle'); startedAt.current = Date.now(); }}>Send another enquiry <ArrowUpRight size={17}/></button></div>;
  return <form className="enquiry-form" onSubmit={submit} onFocus={() => { if (!startedAt.current) startedAt.current = Date.now(); }} noValidate>
    <h3>Tell us what you have in mind.</h3><p className="form-intro">A few details are all we need to get started.</p>
    <div className="form-field"><label htmlFor="enquiry-name">Your name <span>*</span></label><input id="enquiry-name" name="name" autoComplete="name" placeholder="Full name" maxLength={100} required aria-invalid={!!fields.name} aria-describedby={fields.name ? 'error-name' : undefined}/>{fields.name && <p className="field-error" id="error-name">{fields.name}</p>}</div>
    <div className="form-row"><div className="form-field"><label htmlFor="enquiry-email">Email address</label><input id="enquiry-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} aria-invalid={!!fields.email} aria-describedby={fields.email ? 'error-email' : 'contact-method-note'}/></div><div className="form-field"><label htmlFor="enquiry-phone">Phone number</label><input id="enquiry-phone" name="phone" type="tel" autoComplete="tel" placeholder="Your phone number" maxLength={30} aria-invalid={!!fields.phone} aria-describedby={fields.phone ? 'error-phone' : 'contact-method-note'}/></div></div><p className="field-hint" id="contact-method-note">Please provide an email address or phone number.</p>{fields.email && <p className="field-error" id="error-email">{fields.email}</p>}{fields.phone && <p className="field-error" id="error-phone">{fields.phone}</p>}
    <div className="form-field"><label htmlFor="enquiry-service">How can we help? <span>*</span></label><select id="enquiry-service" name="service" defaultValue="" required aria-invalid={!!fields.service} aria-describedby={fields.service ? 'error-service' : undefined}><option value="" disabled>Select a service</option>{categories.map(c => <option key={c}>{c}</option>)}<option value="Not sure yet">More than one service / not sure yet</option></select>{fields.service && <p className="field-error" id="error-service">{fields.service}</p>}</div>
    <div className="form-field"><label htmlFor="enquiry-message">A little about your project <span>*</span></label><textarea id="enquiry-message" name="message" placeholder="Tell us about your space and what you’d like to improve…" rows={4} minLength={10} maxLength={5000} required aria-invalid={!!fields.message} aria-describedby={fields.message ? 'error-message' : undefined}/>{fields.message && <p className="field-error" id="error-message">{fields.message}</p>}</div>
    <div className="honeypot" aria-hidden="true"><label htmlFor="enquiry-website">Leave this blank</label><input id="enquiry-website" name="website" tabIndex={-1} autoComplete="off"/></div>
    {error && <div className="form-error" role="alert">{error} {status === 'error' && !Object.keys(fields).length && <a href={business.phoneHref}>Call us instead.</a>}</div>}
    <button className="button button-primary form-submit" disabled={status === 'loading'} type="submit">{status === 'loading' ? <><LoaderCircle className="spin" size={17}/> Sending your enquiry…</> : <>Request a Free Consultation <ArrowUpRight size={18}/></>}</button><p className="form-privacy">By sending this form, you agree we may contact you about your project. Read our <a href="/privacy">privacy notice</a>.</p>
  </form>;
}
