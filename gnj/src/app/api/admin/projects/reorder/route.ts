import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth';
import { assertSameOrigin, errorResponse, json, readJson } from '@/lib/server/http';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { client } = await requireAdmin();
    const { ids } = z.object({ ids: z.array(z.uuid()).max(1000).refine((ids) => new Set(ids).size === ids.length, 'Project IDs must be unique.') }).parse(await readJson(request));
    const { error } = await client.rpc('reorder_projects', { p_ids: ids });
    if (error) throw error;
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
