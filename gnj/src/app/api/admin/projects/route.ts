import { randomUUID } from 'node:crypto';
import { requireAdmin } from '@/lib/server/auth';
import { getAdminProjects, readProject } from '@/lib/server/projects';
import { assertSameOrigin, errorResponse, HttpError, json, readJson } from '@/lib/server/http';
import { projectCreateSchema, slugify } from '@/lib/validation';

export async function GET() {
  try { return json({ projects: await getAdminProjects() }); } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { client } = await requireAdmin();
    const input = projectCreateSchema.parse(await readJson(request));
    if (input.published || input.images?.length || input.comparisons?.length) throw new HttpError(400, 'Create a draft first, then upload photographs and publish it.');
    const id = randomUUID();
    const { error } = await client.from('projects').insert({
      id, slug: `${slugify(input.title)}-${id.slice(0, 8)}`, title: input.title,
      category: input.category, description: input.description || '', location: input.location || '',
      published: false, featured: input.featured || false, sort_order: input.sort_order || 0,
    });
    if (error) throw error;
    return json({ project: await readProject(client, id) }, 201);
  } catch (error) { return errorResponse(error); }
}
