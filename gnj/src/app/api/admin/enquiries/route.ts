import { requireAdmin } from '@/lib/server/auth';
import { errorResponse, json } from '@/lib/server/http';

export async function GET() {
  try {
    const { client } = await requireAdmin();
    const { data, error } = await client.from('enquiries').select('id, name, email, phone, service, message, created_at').order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    return json({ enquiries: data || [] });
  } catch (error) { return errorResponse(error); }
}
