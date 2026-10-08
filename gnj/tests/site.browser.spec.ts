import { test, expect } from '@playwright/test';

test('desktop navigation, genuine portfolio filters and project gallery work', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Beautifulimprovements.Inside and out.');
  await expect(page.locator('.project-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'View all 4 projects' }).click();
  await expect(page.locator('.project-card')).toHaveCount(4);
  await page.getByRole('button', { name: 'Flooring', exact: true }).click();
  await expect(page.getByText('Your next project could be here.')).toBeVisible();
  await expect(page.locator('.project-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'All projects', exact: true }).click();
  await page.getByRole('link', { name: /A greener garden/ }).click();
  await expect(page.getByRole('heading', { name: 'A greener garden', exact: true })).toBeVisible();
  await expect(page.locator('.cmp-comparison')).toHaveCount(0);
  await page.locator('.gal-open').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('link', { name: 'Request a Free Consultation' }).last().click();
  await expect(page.locator('#contact')).toBeInViewport();
});

test('enquiry validates contact details and never reports success when not saved', async ({ page }) => {
  await page.goto('/#contact');
  const form = page.locator('.enquiry-form');
  await form.getByRole('button', { name: 'Request a Free Consultation' }).click();
  await expect(form.getByRole('alert')).toContainText('highlighted fields');
  await form.getByLabel('Your name').fill('Test Owner');
  await form.getByLabel('Email address').fill('test@example.com');
  await form.getByLabel('How can we help?').selectOption('Flooring');
  await form.getByLabel('A little about your project').fill('I would like to discuss a new laminate floor.');
  const requestPromise = page.waitForResponse(response => response.url().endsWith('/api/enquiries'));
  await form.getByRole('button', { name: 'Request a Free Consultation' }).click();
  const response = await requestPromise;
  expect(response.status()).toBe(503);
  await expect(form.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(page.getByText('Your enquiry has been received.')).toHaveCount(0);
});

test('mobile menu, telephone links and all major layouts fit the viewport', async ({ page }) => {
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    if (width === 390) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.getByRole('navigation')).toBeVisible();
      await page.getByRole('navigation').getByRole('link', { name: 'Our Work', exact: true }).click();
      await expect(page.getByRole('navigation')).not.toBeVisible();
      await expect(page.locator('#work')).toBeInViewport();
    }
  }
  await expect(page.locator('a[href="tel:+447878079245"]').first()).toBeVisible();
  await expect(page.locator('a[href="mailto:Gabor.orban1974@gmail.com"]').first()).toBeVisible();
});

test('admin configuration is protected and APIs deny unauthenticated writes', async ({ page, request }) => {
  await page.goto('/admin');
  await expect(page.getByText(/Supabase/).first()).toBeVisible();
  for (const url of ['/api/admin/projects', '/api/admin/enquiries']) {
    const response = await request.get(url);
    expect([401, 503]).toContain(response.status());
  }
  const write = await request.post('/api/admin/projects', { data: { title: 'Unauthorised', category: 'Flooring' } });
  expect([401, 503]).toContain(write.status());
  const csrf = await request.post('/api/enquiries', { headers: { origin: 'https://untrusted.example' }, data: {} });
  expect(csrf.status()).toBe(403);
  await page.goto('/projects/private-draft-does-not-exist');
  await expect(page.getByRole('heading', { name: 'This page isn’t here.' })).toBeVisible();
});
