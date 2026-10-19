import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: '**/seo.spec.ts', workers: 1, reporter: 'list',
  use: { browserName: 'firefox', baseURL: 'http://127.0.0.1:3200', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build -- --webpack && node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3200',
    url: 'http://127.0.0.1:3200', reuseExistingServer: false, timeout: 180000,
    env: { NEXT_PUBLIC_SITE_URL: 'https://www.gnjgarden.com', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', SEO_NOINDEX: 'false', VERCEL_ENV: 'development' },
  },
});
