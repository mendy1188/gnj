import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';

loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.GNJ_TEST_OWNER_EMAIL;
const password = process.env.GNJ_TEST_OWNER_PASSWORD;

async function main() {
  if (!url || !publicKey || !serviceKey || !email || !password) {
    console.log('SKIPPED live Supabase verification: configure the Supabase keys and GNJ_TEST_OWNER_EMAIL / GNJ_TEST_OWNER_PASSWORD in .env.local.');
    return;
  }
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, publicKey, opts);
  const anonymous = createClient(url, publicKey, opts);
  const service = createClient(url, serviceKey, opts);
  const outsider = createClient(url, publicKey, opts);
  const runId = randomUUID();
  const projectId = randomUUID();
  const imageIds = [randomUUID(), randomUUID()];
  const paths = imageIds.map((id) => `${projectId}/${id}.webp`);
  const rateKey = createHash('sha256').update(runId).digest('hex');
  let outsiderId: string | undefined;
  let enquiryId: string | undefined;
  try {
    const login = await admin.auth.signInWithPassword({ email, password }); assert.equal(login.error, null, 'Owner can sign in');
    assert.equal((await admin.rpc('is_admin')).data, true, 'Signed-in account must be an owner');
    const outsiderEmail = `gnj-test-${runId}@example.invalid`;
    const outsiderPassword = randomUUID() + randomUUID();
    const createdUser = await service.auth.admin.createUser({ email: outsiderEmail, password: outsiderPassword, email_confirm: true, user_metadata: { role: 'admin', is_admin: true } });
    assert.equal(createdUser.error, null); outsiderId = createdUser.data.user!.id;
    assert.equal((await outsider.auth.signInWithPassword({ email: outsiderEmail, password: outsiderPassword })).error, null);
    assert.equal((await outsider.rpc('is_admin')).data, false, 'User metadata must not grant owner access');
    assert.ok((await outsider.from('admin_users').insert({ user_id: outsiderId })).error, 'An account cannot grant itself owner membership');
    assert.equal((await admin.from('projects').insert({ id: projectId, slug: `verification-${runId}`, title: 'Temporary verification project', category: 'Flooring', description: 'Temporary verification project, automatically removed.' })).error, null);
    assert.deepEqual((await anonymous.from('projects').select('id').eq('id', projectId)).data, [], 'Draft project is private');
    assert.deepEqual((await outsider.from('projects').select('id').eq('id', projectId)).data, [], 'Non-owner cannot read draft');
    assert.ok((await anonymous.from('projects').insert({ title: 'Unauthorised', category: 'Flooring', slug: 'unauthorised' })).error);
    const bytes = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#78834b' } }).webp().toBuffer();
    for (const [index, imageId] of imageIds.entries()) {
      assert.equal((await admin.storage.from('project-images').upload(paths[index], bytes, { contentType: 'image/webp' })).error, null, 'Owner upload persists');
      assert.equal((await admin.from('project_images').insert({ id: imageId, project_id: projectId, path: paths[index], alt: `Test photograph ${index + 1}`, sort_order: index })).error, null);
    }
    assert.ok((await anonymous.storage.from('project-images').createSignedUrl(paths[0], 60)).error, 'Draft object must not be signable publicly');
    const saved = { title: 'Temporary verification project', category: 'Flooring', description: 'Temporary verification project, automatically removed.', location: '', published: true, featured: true, sort_order: 4, cover_image_id: imageIds[1], images: imageIds.map((id, index) => ({ id, path: paths[index], alt: `Test photograph ${index + 1}`, caption: '', sort_order: 1 - index })), comparisons: [{ id: randomUUID(), before_id: imageIds[0], after_id: imageIds[1], label: 'Temporary test pair', aligned: true }] };
    assert.equal((await admin.rpc('save_project', { p_project_id: projectId, p_data: saved })).error, null, 'Project publishes atomically');
    assert.equal((await anonymous.from('projects').select('id').eq('id', projectId)).data?.length, 1, 'Published project becomes public');
    assert.equal((await anonymous.from('project_comparisons').select('id').eq('project_id', projectId)).data?.length, 1, 'Explicit pair persists');
    const persistedImages = await admin.from('project_images').select('id').eq('project_id', projectId).order('sort_order');
    assert.equal(persistedImages.data?.[0].id, imageIds[1], 'Gallery order persists');
    const freshAdmin = createClient(url, publicKey, opts);
    await freshAdmin.auth.signInWithPassword({ email, password });
    assert.equal((await freshAdmin.from('projects').select('cover_image_id').eq('id', projectId).single()).data?.cover_image_id, imageIds[1], 'Data survives a fresh session');
    const signed = await anonymous.storage.from('project-images').createSignedUrl(paths[0], 60);
    assert.equal(signed.error, null, 'Published image can be signed');
    assert.equal((await fetch(signed.data!.signedUrl)).status, 200, 'Stored image can be downloaded');
    assert.equal((await admin.rpc('reorder_projects', { p_ids: [projectId] })).error, null);
    assert.equal((await admin.from('projects').select('sort_order').eq('id', projectId).single()).data?.sort_order, 0);
    assert.equal((await admin.rpc('save_project', { p_project_id: projectId, p_data: { ...saved, published: false } })).error, null);
    assert.deepEqual((await anonymous.from('projects').select('id').eq('id', projectId)).data, [], 'Unpublished project is hidden again');
    assert.ok((await anonymous.storage.from('project-images').createSignedUrl(paths[0], 60)).error, 'Unpublished images cannot get new public signed URLs');
    const enquiry = await service.from('enquiries').insert({ name: 'Verification test', email: outsiderEmail, service: 'Flooring', message: 'An automated persistence and privacy check.' }).select('id').single();
    assert.equal(enquiry.error, null); enquiryId = enquiry.data!.id;
    assert.ok((await anonymous.from('enquiries').select('id')).error, 'Enquiries are inaccessible publicly');
    assert.deepEqual((await outsider.from('enquiries').select('id').eq('id', enquiryId)).data, [], 'Enquiries are inaccessible to non-owners');
    assert.equal((await admin.from('enquiries').select('id').eq('id', enquiryId)).data?.length, 1);
    assert.equal((await service.rpc('consume_rate_limit', { p_key: rateKey, p_limit: 1, p_window_seconds: 3600 })).data, true);
    assert.equal((await service.rpc('consume_rate_limit', { p_key: rateKey, p_limit: 1, p_window_seconds: 3600 })).data, false, 'Rate limits persist between requests');
    assert.ok((await anonymous.rpc('consume_rate_limit', { p_key: rateKey, p_limit: 1, p_window_seconds: 3600 })).error);
    console.log('PASS: owner/non-owner authorisation, draft privacy, private storage, publishing, persistence across sessions, image order, comparisons, enquiry privacy and durable rate limits.');
  } finally {
    // Only UUID-scoped fixtures created by this run are removed.
    await service.from('projects').delete().eq('id', projectId);
    await service.storage.from('project-images').remove(paths);
    if (enquiryId) await service.from('enquiries').delete().eq('id', enquiryId);
    await service.from('enquiry_rate_limits').delete().eq('key', rateKey);
    if (outsiderId) await service.auth.admin.deleteUser(outsiderId);
    await admin.auth.signOut();
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
