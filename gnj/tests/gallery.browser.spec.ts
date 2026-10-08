import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// These deliberately synthetic photographs live only in the test browser.
// No fixture route or invented transformation is added to the public portfolio.
const fixture = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectGallery } from './src/components/project-gallery';
import { Comparison } from './src/components/comparison';

const photo = (colour, label, width = 800, height = 600) =>
  'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
    '<rect width="100%" height="100%" fill="' + colour + '"/>' +
    '<text x="50%" y="50%" text-anchor="middle" fill="white" font-size="32">' + label + '</text></svg>'
  );
const images = [
  { id: 'after', path: '', url: photo('#243b18', 'Synthetic AFTER fixture'), alt: 'Synthetic after fixture', caption: 'Synthetic after caption', sort_order: 2 },
  { id: 'before', path: '', url: photo('#87714b', 'Synthetic BEFORE fixture'), alt: 'Synthetic before fixture', caption: 'Synthetic before caption', sort_order: 1 },
  { id: 'detail', path: '', url: photo('#59616c', 'Synthetic DETAIL fixture', 400, 700), alt: 'Synthetic detail fixture', caption: 'Synthetic detail caption', sort_order: 0 },
  { id: 'missing', path: '', url: '', alt: '', caption: '', sort_order: 3 },
];
const pair = { id: 'comparison', before_id: 'before', after_id: 'after', label: 'Synthetic aligned comparison', aligned: true };
createRoot(document.getElementById('root')).render(
  <main style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
    <h1>Isolated gallery test fixture</h1>
    <ProjectGallery images={images} />
    <Comparison pair={pair} images={images} />
    <Comparison pair={{...pair, id: 'unaligned', label: 'Synthetic unaligned comparison', aligned: false}} images={images} />
    <Comparison pair={{...pair, id: 'missing', label: 'Missing image comparison', before_id: 'not-present'}} images={images} />
    <Comparison pair={{...pair, id: 'same', label: 'Identical image comparison', before_id: 'after'}} images={images} />
    <ProjectGallery images={[]} />
  </main>
);
`;

let server: Server;
let baseURL: string;

test.beforeAll(async () => {
  const result = await build({
    stdin: { contents: fixture, loader: 'tsx', resolveDir: process.cwd(), sourcefile: 'gallery-test-fixture.tsx' },
    bundle: true,
    write: false,
    outdir: '/virtual-test-output',
    entryNames: 'fixture',
    jsx: 'automatic',
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  const javascript = result.outputFiles.find((file) => file.path.endsWith('.js'))!.text;
  const stylesheet = result.outputFiles.find((file) => file.path.endsWith('.css'))!.text;
  server = createServer((request, response) => {
    if (request.url === '/fixture.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.end(javascript);
    } else if (request.url === '/fixture.css') {
      response.writeHead(200, { 'Content-Type': 'text/css' });
      response.end(stylesheet);
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Synthetic component fixture</title><link rel="stylesheet" href="/fixture.css"></head><body style="margin:0;background:#faf8f2;font-family:Arial,sans-serif"><div id="root"></div><script src="/fixture.js"></script></body></html>');
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

test.beforeEach(async ({ page }) => {
  await page.goto(baseURL);
});

test('orders valid photographs and supports complete keyboard lightbox navigation', async ({ page }) => {
  const buttons = page.getByRole('button', { name: /^Enlarge photograph/ });
  await expect(buttons).toHaveCount(3);
  await expect(buttons.first()).toHaveAccessibleName('Enlarge photograph 1: Synthetic detail fixture');
  await buttons.first().click();
  const viewer = page.getByRole('dialog', { name: 'Project photograph viewer' });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('img')).toHaveAttribute('alt', 'Synthetic detail fixture');
  await expect(viewer.getByRole('button', { name: 'Close photograph viewer' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(viewer.getByRole('img')).toHaveAttribute('alt', 'Synthetic before fixture');
  await expect(viewer).toContainText('Photograph 2 of 3');
  await viewer.getByRole('button', { name: 'Next photograph' }).click();
  await expect(viewer.getByRole('img')).toHaveAttribute('alt', 'Synthetic after fixture');
  await page.keyboard.press('ArrowRight');
  await expect(viewer.getByRole('img')).toHaveAttribute('alt', 'Synthetic detail fixture');
  await page.keyboard.press('ArrowLeft');
  await expect(viewer.getByRole('img')).toHaveAttribute('alt', 'Synthetic after fixture');
  await page.keyboard.press('Escape');
  await expect(viewer).not.toBeVisible();
  await expect(buttons.first()).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('closes the lightbox from its close button and backdrop', async ({ page }) => {
  const open = page.getByRole('button', { name: /^Enlarge photograph/ }).first();
  const viewer = page.getByRole('dialog', { name: 'Project photograph viewer' });
  await open.click();
  await viewer.getByRole('button', { name: 'Close photograph viewer' }).click();
  await expect(viewer).not.toBeVisible();
  await open.click();
  await page.mouse.click(2, 2);
  await expect(viewer).not.toBeVisible();
});

test('aligned comparison responds to keyboard and pointer and offers complete photographs', async ({ page }) => {
  const comparison = page.getByRole('region', { name: 'Synthetic aligned comparison', exact: true });
  const slider = comparison.getByRole('slider', { name: /Before and after image divider/ });
  await expect(slider).toHaveValue('50');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('51');
  await expect(slider).toHaveAttribute('aria-valuetext', '51% before photograph, 49% after photograph');
  await page.keyboard.press('Home');
  await expect(slider).toHaveValue('0');
  await page.keyboard.press('End');
  await expect(slider).toHaveValue('100');
  const bounds = await slider.boundingBox();
  if (!bounds) throw new Error('Comparison slider is not visible');
  await slider.click({ position: { x: bounds.width * .3, y: bounds.height / 2 } });
  const value = Number(await slider.inputValue());
  expect(value).toBeGreaterThan(20);
  expect(value).toBeLessThan(40);
  await comparison.getByRole('button', { name: 'Full photographs' }).click();
  await expect(slider).toHaveCount(0);
  await expect(comparison.getByRole('button', { name: 'Full photographs' })).toHaveAttribute('aria-pressed', 'true');
  const photos = comparison.locator('.cmp-full-photo-wrap img');
  await expect(photos).toHaveCount(2);
  for (const photo of await photos.all()) {
    const dimensions = await photo.evaluate((image) => {
      const element = image as HTMLImageElement;
      return { rendered: element.width / element.height, original: element.naturalWidth / element.naturalHeight };
    });
    expect(dimensions.rendered).toBeCloseTo(dimensions.original, 2);
  }
});

test('unaligned pairs use full photographs and invalid pairs stay absent', async ({ page }) => {
  const comparison = page.getByRole('region', { name: 'Synthetic unaligned comparison', exact: true });
  await expect(comparison.locator('.cmp-full-photo-wrap img')).toHaveCount(2);
  await expect(comparison.getByRole('slider')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Missing image comparison' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Identical image comparison' })).toHaveCount(0);
});

test('full photographs stack on mobile without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const comparison = page.getByRole('region', { name: 'Synthetic unaligned comparison', exact: true });
  const photos = comparison.locator('.cmp-full-figure');
  const first = await photos.nth(0).boundingBox();
  const second = await photos.nth(1).boundingBox();
  if (!first || !second) throw new Error('Full comparison photographs are missing');
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  expect(Math.abs(second.x - first.x)).toBeLessThan(1);
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasOverflow).toBe(false);
});

test('comparison divider accepts a touch interaction', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(baseURL);
    const slider = page.getByRole('region', { name: 'Synthetic aligned comparison', exact: true }).getByRole('slider');
    await slider.scrollIntoViewIfNeeded();
    const bounds = await slider.boundingBox();
    if (!bounds) throw new Error('Comparison slider is missing on mobile');
    await page.touchscreen.tap(bounds.x + bounds.width * .75, bounds.y + bounds.height / 2);
    const value = Number(await slider.inputValue());
    expect(value).toBeGreaterThan(65);
    expect(value).toBeLessThan(85);
  } finally {
    await context.close();
  }
});
