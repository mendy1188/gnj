import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { assertSameOrigin, errorResponse, json } from '@/lib/server/http';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (isSupabaseConfigured()) {
      const client = await createServerSupabaseClient();
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
    }
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
