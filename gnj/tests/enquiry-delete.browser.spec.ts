import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

let server: Server;
let baseURL: string;
const enquiry = {
  id: '10000000-0000-4000-8000-000000000001', name: 'Test Customer',
  email: 'customer@example.test', phone: '', service: 'Flooring',
  message: 'Please discuss a flooring project with me.', created_at: '2026-11-09T09:00:00Z',
};

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
        import { AdminDashboard } from './src/components/admin/AdminDashboard';
        createRoot(document.getElementById('root')).render(<AdminDashboard email="owner@example.test" />);`,
      loader: 'tsx', resolveDir: process.cwd(), sourcefile: 'enquiry-delete-fixture.tsx',
    },
    bundle: true, write: false, jsx: 'automatic', platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'next-fixture', setup(builder) {
      builder.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
        contents: args.path === 'next/link' ? 'export default "a";' : 'export function useRouter() { return { refresh() {} }; }', loader: 'js',
      }));
    } }],
  });
  server = createServer((request, response) => {
    if (request.url === '/fixture.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(result.outputFiles[0].text);
    } else if (request.url === '/api/admin/projects') {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"projects":[]}');
    } else if (request.url === '/admin') {
      response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><html lang="en"><head><title>Enquiry deletion</title></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
    } else response.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('cancel keeps the enquiry; failure allows retry; confirmed deletion persists on refresh', async ({ page }) => {
  let enquiries = [enquiry];
  let deleteRequests = 0;
  let fail = true;
  let releaseDelete: (() => void) | undefined;
  await page.route('**/api/admin/enquiries', route => route.fulfill({ json: { enquiries } }));
  await page.route(`**/api/admin/enquiries/${enquiry.id}`, async route => {
    expect(route.request().method()).toBe('DELETE');
    deleteRequests++;
    if (fail) return route.fulfill({ status: 500, json: { error: 'Could not delete this enquiry.' } });
    await new Promise<void>(resolve => { releaseDelete = resolve; });
    enquiries = [];
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto(`${baseURL}/admin`);
  await page.getByRole('button', { name: 'Enquiries', exact: true }).click();
  const button = page.getByRole('button', { name: 'Delete enquiry from Test Customer' });
  await expect(button).toBeVisible();
  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('This cannot be undone.');
    await dialog.dismiss();
  });
  await button.click();
  await expect(button).toBeEnabled();
  expect(deleteRequests).toBe(0);

  page.once('dialog', dialog => dialog.accept());
  await button.click();
  await expect(page.getByRole('alert')).toContainText('Could not delete this enquiry.');
  await expect(button).toBeEnabled();
  await expect(page.getByText(enquiry.message)).toBeVisible();

  fail = false;
  page.once('dialog', dialog => dialog.accept());
  await button.click();
  await expect(button).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Refresh dashboard' })).toBeDisabled();
  await expect.poll(() => Boolean(releaseDelete)).toBe(true);
  releaseDelete!();
  await expect(page.getByRole('heading', { name: 'A home for new conversations.' })).toBeVisible();
  await expect(button).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'A home for new conversations.' })).toBeVisible();
  expect(deleteRequests).toBe(2);
});
