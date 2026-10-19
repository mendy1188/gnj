import { test, expect } from '@playwright/test';
import { services } from '../src/lib/services';

test('public landing pages have unique metadata, canonicals, local coverage and useful content', async ({ page }) => {
  const titles = new Set<string>();
  for (const path of ['/', '/services', ...services.map(service => `/services/${service.slug}`), '/projects', '/contact', '/privacy']) {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://www.gnjgarden.com${path === '/' ? '' : path}`);
    const title = await page.title(); expect(titles.has(title)).toBeFalsy(); titles.add(title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S.{40,}/);
    if (path !== '/privacy' && path !== '/projects') await expect(page.getByText(/50 miles of Huntingdon/).first()).toBeVisible();
    const schemas = await page.locator('script[type="application/ld+json"]').allTextContents();
    for (const schema of schemas) expect(() => JSON.parse(schema)).not.toThrow();
    expect(schemas.map(schema => JSON.parse(schema)['@type'])).toContain('HomeAndConstructionBusiness');
  }
});

test('all published project links exist in server HTML without JavaScript or a View all click', async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:3200/projects');
    await expect(page.locator('.project-card')).toHaveCount(4);
    await page.getByRole('link', { name: /A greener garden/ }).click();
    await expect(page.locator('h1')).toHaveText('A greener garden');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.gnjgarden.com/projects/a-greener-garden');
    await expect(page.locator('.gal-grid img').first()).toHaveAttribute('loading', 'eager');
  } finally { await context.close(); }
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBeTruthy();
  const xml = await sitemap.text();
  expect(xml).toContain('https://www.gnjgarden.com/projects/a-greener-garden');
  expect(xml).toContain('https://www.gnjgarden.com/services/plumbing');
  expect(xml).toContain('<image:loc>https://www.gnjgarden.com/images/garden.webp</image:loc>');
  expect(xml).not.toContain('localhost'); expect(xml).not.toContain('token=');
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Sitemap: https://www.gnjgarden.com/sitemap.xml');
  expect(robots).not.toContain('Disallow: /project-images');
});

test('service links, mobile layouts, contact labels and project gallery keyboard controls work', async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/services', '/services/garden-landscaping-patios', '/projects', '/contact']) {
      await page.goto(path); await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    }
  }
  await expect(page.getByLabel('Your name')).toBeVisible();
  await page.goto('/projects/a-greener-garden');
  await page.locator('.gal-open').first().focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('link', { name: 'garden landscaping, patios & paving', exact: true }).click();
  await expect(page).toHaveURL(/\/services\/garden-landscaping-patios$/);
});

test('unknown services/projects and private-media-shaped URLs cannot become indexable content', async ({ request }) => {
  const missing = await request.get('/services/not-a-real-service');
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain('noindex');
  const photo = await request.get('/project-images/a93a4581-5b5c-42d7-bc34-533a2fc71ec5/6f630cac-2b1e-48a8-8270-964399682cd1/private.webp');
  expect(photo.status()).toBe(404);
});
