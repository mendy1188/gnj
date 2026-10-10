import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Project, ProjectImage, ProjectVideo } from '../src/lib/types';

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
  videos: [],
  comparisons: [],
};

const videos: ProjectVideo[] = [
  '7cdfcfb6-dcf2-478b-b055-d8c6a7c74e68',
  '8ea4e22d-0bbf-4ab9-b803-c476c53f32be',
  '07438ac1-8cf6-4f1d-b1eb-ce940f3e16ec',
].map((id, index) => ({ id, path: `${project.id}/${id}.mp4`, url: `data:video/mp4;base64,AAAA${index}`, caption: '', sort_order: index }));

const fixture = `
import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectEditor } from './src/components/admin/ProjectEditor';
import { ProjectVideos } from './src/components/project-videos';
function Fixture() {
  const navigationGuard = useRef(null);
  const initialProject = { ...${JSON.stringify(project)}, ...(window.location.pathname === '/video-setup-pending' ? { video_uploads_enabled: false } : {}) };
  return <ProjectEditor initialProject={initialProject} navigationGuard={navigationGuard} onClose={() => {}} onSaved={() => {}} />;
}
createRoot(document.getElementById('root')).render(window.location.pathname === '/videos' ? <ProjectVideos videos={${JSON.stringify([{ ...videos[1], caption: 'Finished terrace' }, { ...videos[0], caption: 'Garden walkthrough' }])}} /> : window.location.pathname === '/videos-empty' ? <ProjectVideos videos={[]} /> : <Fixture />);
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

test('keeps photographs and project details editable while video setup is pending', async ({ page }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const image: ProjectImage = {
    id: '8939b2fb-e87b-4a74-9704-e17c9c7de2c0',
    path: `${project.id}/8939b2fb-e87b-4a74-9704-e17c9c7de2c0.png`,
    url: `data:image/png;base64,${png.toString('base64')}`,
    alt: '', caption: '', sort_order: 0,
  };
  let savedPayload: Partial<Project> | undefined;
  let videoUploadCount = 0;
  await page.route('**/api/admin/video-uploads', async route => {
    videoUploadCount++;
    await route.fulfill({ json: { video: videos[0] } });
  });
  await page.route('**/api/admin/uploads', route => route.fulfill({ json: { image } }));
  await page.route(`**/api/admin/projects/${project.id}`, async route => {
    if (route.request().method() === 'PATCH') {
      savedPayload = route.request().postDataJSON() as Partial<Project>;
      // Setup may finish in another session while this editor is still open.
      await route.fulfill({ json: { project: { ...project, ...savedPayload, images: [{ ...image, ...savedPayload.images?.[0] }], videos: [videos[0]], video_uploads_enabled: true } } });
    } else {
      await route.fulfill({ json: { project: { ...project, video_uploads_enabled: false } } });
    }
  });

  await page.goto(`${baseURL}/video-setup-pending`);
  await expect(page.getByText('Video uploads are not available yet. You can still edit and save the rest of this project.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Video setup pending' })).toBeDisabled();
  await expect(page.locator('#admin-video-upload')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Choose photographs' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeEnabled();
  await page.locator('#admin-video-upload').evaluate(element => {
    const input = element as HTMLInputElement;
    const files = new DataTransfer();
    files.items.add(new File(['test video'], 'walkthrough.mp4', { type: 'video/mp4' }));
    input.files = files.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.getByLabel('Project title').fill('Garden with a new terrace');
  await page.getByLabel('Project description').fill('A renovated terrace and freshly planted borders.');
  await page.locator('#admin-photo-upload').setInputFiles({ name: 'garden.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.admin-image-editor')).toHaveCount(1);
  await page.getByLabel('Alternative text').fill('Stone terrace beside a flower border');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toContainText('Your draft is saved.');

  expect(savedPayload).toMatchObject({
    title: 'Garden with a new terrace',
    description: 'A renovated terrace and freshly planted borders.',
    cover_image_id: image.id,
    images: [{ id: image.id, path: image.path, alt: 'Stone terrace beside a flower border', caption: '', sort_order: 0 }],
  });
  expect(savedPayload).not.toHaveProperty('videos');
  expect(videoUploadCount).toBe(0);
  await expect(page.locator('.admin-video-editor')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Choose videos' })).toBeEnabled();
  await expect(page.getByText('Video uploads are not available yet. You can still edit and save the rest of this project.')).toHaveCount(0);
});

test('uploads at most two videos, previews them, and frees removed slots only after saving', async ({ page }) => {
  await page.clock.install();
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let uploadCount = 0;
  let storedVideos: ProjectVideo[] = [];
  let savedPayload: Partial<Project> | undefined;
  let finishFirstUpload: (() => void) | undefined;
  const firstUploadGate = new Promise<void>(resolve => { finishFirstUpload = resolve; });
  let holdRenewal = false;
  let finishRenewal: (() => void) | undefined;
  let markRenewalStarted: (() => void) | undefined;
  const renewalGate = new Promise<void>(resolve => { finishRenewal = resolve; });
  const renewalStarted = new Promise<void>(resolve => { markRenewalStarted = resolve; });
  await page.route('**/api/admin/video-uploads', async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataBuffer()?.toString()).toContain(project.id);
    const video = videos[uploadCount++];
    if (uploadCount === 1) await firstUploadGate;
    storedVideos.push(video);
    await route.fulfill({ json: { video } });
  });
  await page.route(`**/api/admin/projects/${project.id}`, async route => {
    if (route.request().method() === 'PATCH') {
      savedPayload = route.request().postDataJSON() as Partial<Project>;
      storedVideos = (savedPayload.videos ?? []).map(video => ({ ...storedVideos.find(stored => stored.id === video.id)!, ...video }));
      await route.fulfill({ json: { project: { ...project, ...savedPayload, videos: storedVideos } } });
    } else {
      const snapshot = { ...project, videos: [...storedVideos] };
      if (holdRenewal) { markRenewalStarted!(); await renewalGate; }
      await route.fulfill({ json: { project: snapshot } });
    }
  });

  await page.goto(baseURL);
  const first = { name: 'walkthrough.mp4', mimeType: 'video/mp4', buffer: Buffer.from('test video') };
  const second = { name: 'finished.webm', mimeType: 'video/webm', buffer: Buffer.from('test video') };
  await page.locator('#admin-video-upload').setInputFiles([first, second, first]);
  await expect(page.getByRole('alert')).toContainText('up to two videos');
  expect(uploadCount).toBe(0);
  await page.locator('#admin-video-upload').setInputFiles([first, second]);
  await expect(page.getByRole('button', { name: 'Uploading videos…' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Back to projects' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Choose photographs' })).toBeDisabled();
  finishFirstUpload!();
  await expect(page.locator('.admin-video-editor')).toHaveCount(2);
  await expect(page.locator('.admin-video-upload-item')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Two-video limit reached' })).toBeDisabled();
  await expect(page.locator('#admin-video-upload')).toBeDisabled();
  await expect(page.locator('.admin-video-count')).toHaveText('2 of 2 videos added');
  expect(uploadCount).toBe(2);

  await page.getByLabel('Video caption').nth(0).fill('Garden walkthrough');
  await page.getByLabel('Video caption').nth(1).fill('Finished terrace');
  await page.getByRole('button', { name: 'Move video 2 up' }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const previewVideos = page.locator('.admin-preview-videos video');
  await expect(previewVideos).toHaveCount(2);
  await expect(previewVideos.nth(0)).toHaveAttribute('aria-label', 'Finished terrace');
  expect(await previewVideos.evaluateAll(elements => elements.map(element => {
    const video = element as HTMLVideoElement;
    return { controls: video.controls, inline: video.playsInline, preload: video.preload, autoplay: video.autoplay };
  }))).toEqual(Array(2).fill({ controls: true, inline: true, preload: 'metadata', autoplay: false }));
  await page.getByRole('button', { name: 'Close project preview' }).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toContainText('Your draft is saved.');
  expect(savedPayload?.videos).toEqual([
    { id: videos[1].id, path: videos[1].path, caption: 'Finished terrace', sort_order: 0 },
    { id: videos[0].id, path: videos[0].path, caption: 'Garden walkthrough', sort_order: 1 },
  ]);

  // A signed-URL refresh begun before a removal must not restore the removed video's occupied slot.
  holdRenewal = true;
  await page.clock.fastForward(4 * 60 * 1000);
  await renewalStarted;
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove video 1' }).click();
  await expect(page.locator('.admin-video-editor')).toHaveCount(1);
  await expect(page.getByRole('status')).toContainText('Save your changes to finish removing videos');
  await expect(page.locator('#admin-video-upload')).toBeDisabled();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('button', { name: 'Choose videos' })).toBeEnabled();
  expect(savedPayload?.videos?.map(video => video.id)).toEqual([videos[0].id]);
  const oldRenewalFinished = page.waitForResponse(response => response.request().method() === 'GET' && response.url().endsWith(`/api/admin/projects/${project.id}`));
  finishRenewal!();
  await oldRenewalFinished;
  await expect(page.getByRole('button', { name: 'Choose videos' })).toBeEnabled();
  await page.locator('#admin-video-upload').setInputFiles(first);
  await expect(page.locator('.admin-video-editor')).toHaveCount(2);
  await expect(page.locator('#admin-video-upload')).toBeDisabled();
  expect(uploadCount).toBe(3);
  expect(pageErrors).toEqual([]);
});

test('validates video files and keeps failed uploads recoverable', async ({ page }) => {
  let uploadCount = 0;
  await page.route(`**/api/admin/projects/${project.id}`, route => route.fulfill({ json: { project } }));
  await page.route('**/api/admin/video-uploads', async route => {
    uploadCount++;
    await route.fulfill(uploadCount === 1 ? { status: 400, json: { error: 'This video could not be processed. Choose another file.' } } : { json: { video: videos[0] } });
  });
  await page.goto(baseURL);
  await page.locator('#admin-video-upload').setInputFiles({ name: 'unsupported.mov', mimeType: 'video/quicktime', buffer: Buffer.from('test video') });
  await expect(page.getByRole('alert')).toContainText('Choose MP4 or WebM videos');
  await page.locator('#admin-video-upload').evaluate(element => {
    const input = element as HTMLInputElement;
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'too-large.mp4', { type: 'video/mp4' }));
    input.files = data.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByRole('alert')).toContainText('up to 50 MB');
  expect(uploadCount).toBe(0);

  const file = { name: 'walkthrough.mp4', mimeType: 'video/mp4', buffer: Buffer.from('test video') };
  await page.locator('#admin-video-upload').setInputFiles(file);
  await expect(page.getByRole('alert')).toContainText('could not be processed');
  await expect(page.getByRole('button', { name: 'Choose videos' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeEnabled();
  await expect(page.locator('.admin-video-editor')).toHaveCount(0);
  await page.getByRole('button', { name: 'Dismiss failed upload walkthrough.mp4' }).click();
  await page.locator('#admin-video-upload').setInputFiles(file);
  await expect(page.locator('.admin-video-editor')).toHaveCount(1);
  await expect(page.locator('.admin-video-upload-item')).toHaveCount(0);
  expect(uploadCount).toBe(2);
});

test('public video gallery renders videos in order with captions and manual playback', async ({ page }) => {
  await page.goto(`${baseURL}/videos`);
  await expect(page.getByRole('heading', { name: 'Our work in motion.' })).toBeVisible();
  const players = page.locator('.project-videos video');
  await expect(players).toHaveCount(2);
  await expect(players.nth(0)).toHaveAttribute('aria-label', 'Garden walkthrough');
  await expect(players.nth(1)).toHaveAttribute('aria-label', 'Finished terrace');
  await expect(page.locator('.project-videos figcaption')).toHaveText(['Garden walkthrough', 'Finished terrace']);
  expect(await players.evaluateAll(elements => elements.every(element => {
    const video = element as HTMLVideoElement;
    return video.controls && video.playsInline && video.preload === 'metadata' && !video.autoplay;
  }))).toBe(true);
  await page.goto(`${baseURL}/videos-empty`);
  await expect(page.locator('.project-videos')).toHaveCount(0);
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
