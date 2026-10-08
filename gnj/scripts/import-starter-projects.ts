import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { seedProjects } from '../src/lib/content';
import { optimiseProjectImage } from '../src/lib/server/images';

loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  for (const project of seedProjects) {
    const { data: existing, error: lookupError } = await client.from('projects').select('id').eq('slug', project.slug).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) { console.log(`Already present: ${project.title}`); continue; }
    const id = randomUUID();
    const uploadedPaths: string[] = [];
    try {
      const { error: createError } = await client.from('projects').insert({ id, slug: project.slug, title: project.title, category: project.category, description: project.description, location: '', published: false, featured: project.featured, sort_order: project.sort_order });
      if (createError) throw createError;
      let coverId = '';
      for (const [index, image] of project.images.entries()) {
        const imageId = randomUUID();
        const storagePath = `${id}/${imageId}.webp`;
        const bytes = await optimiseProjectImage(await readFile(path.join(process.cwd(), 'public', image.path)));
        const { error: uploadError } = await client.storage.from('project-images').upload(storagePath, bytes, { contentType: 'image/webp', cacheControl: '300' });
        if (uploadError) throw uploadError;
        uploadedPaths.push(storagePath);
        const { error: imageError } = await client.from('project_images').insert({ id: imageId, project_id: id, path: storagePath, alt: image.alt, caption: image.caption, sort_order: index, is_pending: false });
        if (imageError) throw imageError;
        if (!coverId) coverId = imageId;
      }
      const { error: publishError } = await client.from('projects').update({ cover_image_id: coverId, published: true }).eq('id', id);
      if (publishError) throw publishError;
      console.log(`Imported: ${project.title}`);
    } catch (error) {
      await client.from('projects').delete().eq('id', id);
      if (uploadedPaths.length) await client.storage.from('project-images').remove(uploadedPaths);
      throw error;
    }
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
