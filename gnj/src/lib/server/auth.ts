import 'server-only';
import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HttpError } from './http';

export async function getAdminSession() {
  if (!isSupabaseConfigured()) return { configured: false, user: null };
  const client = await createServerSupabaseClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { configured: true, user: null };
  const { data: allowed, error: roleError } = await client.rpc('is_admin');
  if (roleError) throw new HttpError(503, 'The owner dashboard is unavailable. Please check the database setup.');
  return { configured: true, user: allowed ? { id: user.id, email: user.email } : null };
}

export async function requireAdmin(options: { redirectToLogin?: boolean } = {}) {
  if (!isSupabaseConfigured()) throw new HttpError(503, 'The owner dashboard needs Supabase configuration.');
  const client = await createServerSupabaseClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    if (options.redirectToLogin) redirect('/admin');
    throw new HttpError(401, 'Please sign in to continue.');
  }
  const { data: allowed, error: roleError } = await client.rpc('is_admin');
  if (roleError) throw new HttpError(503, 'The owner dashboard is unavailable. Please check the database setup.');
  if (!allowed) {
    if (options.redirectToLogin) redirect('/admin');
    throw new HttpError(403, 'This account does not have owner access.');
  }
  return { user, client };
}
