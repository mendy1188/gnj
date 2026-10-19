import assert from 'node:assert/strict';
import test from 'node:test';
import { absoluteUrl, breadcrumbs, businessSchema, indexingEnabled, jsonLd, pageMetadata, projectSchema, siteOrigin, sitemapEntries } from '../src/lib/seo';
import { services } from '../src/lib/services';
import { seedProjects } from '../src/lib/content';
import { imageFileName, publicImageUrl } from '../src/lib/public-images';

test('canonical origins normalize safely and cannot include credentials or paths', () => {
  assert.equal(siteOrigin('https://www.gnjgarden.com/'), 'https://www.gnjgarden.com');
  assert.equal(siteOrigin(''), undefined);
  for (const value of ['javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com/folder', 'https://example.com/?token=secret']) assert.throws(() => siteOrigin(value));
  assert.equal(indexingEnabled('http://localhost:3000'), false);
  assert.equal(indexingEnabled('http://127.0.0.1:3000'), false);
  assert.equal(absoluteUrl('/services/plumbing', 'https://www.gnjgarden.com'), 'https://www.gnjgarden.com/services/plumbing');
});

test('metadata and structured data describe the page and confirmed coverage', () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.gnjgarden.com';
  try {
    const metadata = pageMetadata({ title: 'Plumbing in Huntingdon', description: 'Sinks and taps.', path: '/services/plumbing', image: '/images/garden.webp' });
    assert.equal(metadata.alternates?.canonical, 'https://www.gnjgarden.com/services/plumbing');
    assert.equal(metadata.openGraph?.title, 'Plumbing in Huntingdon');
    assert.equal(metadata.twitter?.description, 'Sinks and taps.');
    assert.match(String(businessSchema()?.areaServed), /50 miles of Huntingdon/);
    const trail = breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Services', path: '/services' }]);
    assert.deepEqual(trail?.itemListElement.map(item => item.position), [1, 2]);
    assert.equal(projectSchema(seedProjects[0])?.image[0], 'https://www.gnjgarden.com/images/garden.webp');
    assert.doesNotMatch(jsonLd({ text: '</script><script>alert(1)</script>' }), /</);
  } finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = previous; }
});

test('sitemap covers every service and public project without drafts or invented modification dates', () => {
  const draft = { ...seedProjects[0], slug: 'private-draft', published: false };
  const rows = sitemapEntries([...seedProjects, draft], 'https://www.gnjgarden.com');
  for (const service of services) assert.ok(rows.some(row => row.url.endsWith(`/services/${service.slug}`)));
  for (const path of ['/projects', '/contact', '/services']) assert.ok(rows.some(row => row.url.endsWith(path)));
  assert.ok(!rows.some(row => row.url.includes('private-draft')));
  const garden = rows.find(row => row.url.endsWith(`/projects/${seedProjects[0].slug}`));
  assert.deepEqual(garden?.images, ['https://www.gnjgarden.com/images/garden.webp']);
  assert.equal(garden?.lastModified, undefined);
  assert.equal(new Set(rows.map(row => row.url)).size, rows.length);
});

test('image URLs are stable, descriptive and independent of signing tokens', () => {
  const photo = { id: 'photo-id', path: 'project-id/photo.webp', alt: 'Paved patio & garden steps', caption: '' };
  assert.equal(publicImageUrl({ id: 'project-id', title: 'Patio' }, photo), '/project-images/project-id/photo-id/paved-patio-garden-steps.webp');
  assert.equal(imageFileName('Project', { alt: '', caption: 'Before improvements' }), 'before-improvements.webp');
  assert.equal(imageFileName('Project', { alt: '../<script>', caption: '' }), 'script.webp');
  assert.equal(publicImageUrl(seedProjects[0], seedProjects[0].images[0]), '/images/garden.webp');
});

test('preview indexing is explicitly disabled', () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';
  try {
    assert.equal(indexingEnabled('https://www.gnjgarden.com'), false);
    assert.deepEqual(sitemapEntries(seedProjects, 'https://www.gnjgarden.com'), []);
  } finally { if (previous === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous; }
});
