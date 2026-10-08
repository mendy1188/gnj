import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Project, ProjectImage } from '../src/lib/types';

const project: Project = {
  id: 'd04fb251-f201-45d8-8711-00aa0f4fc603',
  slug: 'upload-regression-fixture',
  title: 'Upload regression fixture',
  category: 'Garden & Outdoor Improvements',
  description: '',
  location: '',
  published: false,
  featured: false,
  sort_order: 0,
  cover_image_id: null,
  images: [],
  comparisons: [],
};

const fixture = `
import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectEditor } from './src/components/admin/ProjectEditor';
function Fixture() {
  const navigationGuard = useRef(null);
  return <ProjectEditor initialProject={${JSON.stringify(project)}} navigationGuard={navigationGuard} onClose={() => {}} onSaved={() => {}} />;
}
createRoot(document.getElementById('root')).render(<Fixture />);
`;

let server: Server;
let baseURL: string;

test.beforeAll(async () => {
  const result = await build({
    stdin: { contents: fixture, loader: 'tsx', resolveDir: process.cwd(), sourcefile: 'project-editor-test-fixture.tsx' },
    bundle: true,
    write: false,
    jsx: 'automatic',
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  server = createServer((request, response) => {
    if (request.url === '/fixture.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.end(result.outputFiles[0].text);
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><html lang="en"><head><title>Project editor test fixture</title></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('uploads photographs and saves a comparison when crypto.randomUUID is unavailable', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window.crypto, 'randomUUID', { configurable: true, value: undefined });
  });

  // All photographs and API responses remain inside this isolated browser fixture.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const images: ProjectImage[] = [
    '8939b2fb-e87b-4a74-9704-e17c9c7de2c0',
    '8d0f12cb-ac34-4091-b55d-15eeaa5a7865',
  ].map((id, index) => ({
    id,
    path: `${project.id}/${id}.png`,
    url: `data:image/png;base64,${png.toString('base64')}`,
    alt: `Synthetic photograph ${index + 1}`,
    caption: '',
    sort_order: index,
  }));
  let uploadCount = 0;
  let savedPayload: Partial<Project> | undefined;
  await page.route('**/api/admin/uploads', async (route) => {
    expect(route.request().method()).toBe('POST');
    const image = images[uploadCount++];
    await route.fulfill({ json: { image } });
  });
  await page.route(`**/api/admin/projects/${project.id}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      savedPayload = route.request().postDataJSON() as Partial<Project>;
      await route.fulfill({ json: { project: { ...project, ...savedPayload, images } } });
    } else {
      await route.fulfill({ json: { project } });
    }
  });

  await page.goto(baseURL);
  expect(await page.evaluate(() => typeof window.crypto.randomUUID)).toBe('undefined');
  await page.locator('#admin-photo-upload').setInputFiles([
    { name: 'before.png', mimeType: 'image/png', buffer: png },
    { name: 'after.png', mimeType: 'image/png', buffer: png },
  ]);
  await expect(page.locator('.admin-image-editor')).toHaveCount(2);
  await expect(page.locator('.admin-upload-item')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Choose photographs' })).toBeEnabled();
  expect(uploadCount).toBe(2);

  await page.getByRole('button', { name: 'Add a before-and-after pair' }).click();
  await page.getByRole('combobox', { name: /^Before/ }).selectOption(images[0].id);
  await page.getByRole('combobox', { name: /^After/ }).selectOption(images[1].id);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toContainText('Your draft is saved.');

  expect(savedPayload?.images?.map((image) => image.id)).toEqual(images.map((image) => image.id));
  expect(savedPayload?.cover_image_id).toBe(images[0].id);
  expect(savedPayload?.comparisons).toHaveLength(1);
  expect(savedPayload?.comparisons?.[0]).toMatchObject({ before_id: images[0].id, after_id: images[1].id });
  expect(savedPayload?.comparisons?.[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(pageErrors).toEqual([]);
});
