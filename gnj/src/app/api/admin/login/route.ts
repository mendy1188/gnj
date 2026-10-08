import { z } from 'zod';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { assertSameOrigin, errorResponse, HttpError, json, readJson } from '@/lib/server/http';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!isSupabaseConfigured()) throw new HttpError(503, 'The owner dashboard needs Supabase configuration.');
    const { email, password } = z.object({ email: z.email().max(254), password: z.string().min(1).max(256) }).parse(await readJson(request));
    const client = await createServerSupabaseClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new HttpError(error.status === 429 ? 429 : 401, error.status === 429 ? 'Too many sign-in attempts. Please try again later.' : 'The email or password is incorrect.');
    const { data: allowed, error: roleError } = await client.rpc('is_admin');
    if (roleError || !allowed) {
      await client.auth.signOut();
      throw new HttpError(roleError ? 503 : 403, roleError ? 'Owner access is not configured. Please check the database setup.' : 'This account does not have owner access.');
    }
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
