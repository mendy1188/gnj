import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth';
import { assertSameOrigin, errorResponse, HttpError, json } from '@/lib/server/http';

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { client } = await requireAdmin();
    const id = z.uuid().parse((await context.params).id);
    const { data, error } = await client.from('enquiries').delete().eq('id', id).select('id').maybeSingle();
    if (error?.code === '42501') throw new HttpError(503, 'Enquiry deletion is not enabled yet. Please ask your website administrator to finish the database setup.');
    if (error) throw error;
    if (!data) throw new HttpError(404, 'Enquiry not found.');
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
