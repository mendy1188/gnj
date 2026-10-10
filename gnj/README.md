# GNJ Home & Garden Improvement

A responsive Next.js 16, TypeScript and Tailwind website with a Supabase owner dashboard, private photo/video storage and persistent enquiries.

## Run locally

Use Node.js 20.9 or later (Node.js 22 LTS recommended).

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. With no Supabase credentials, the public website shows four completed-work photographs from GNJ's supplied flyer. These are genuine reference photographs, not before-and-after pairs. Their original resolution is limited; replace them with full-resolution originals through the dashboard when available. The owner sign-in and enquiry form clearly report missing configuration and never pretend to save data.

Business contact details and introductory copy live in `src/lib/content.ts`. Set `NEXT_PUBLIC_SERVICE_AREA` only when GNJ confirms its service area. No location, credentials, customer testimonials or company history have been invented.

## Configure Supabase

1. Create a Supabase project. In its SQL Editor, run each SQL file in `supabase/migrations` once, in filename order. For an existing installation, apply the new `202610100001_project_videos.sql` migration before deploying the video feature. Alternatively, link the Supabase CLI to your project and run `supabase db push`.
2. In `.env.local`, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the project's API settings. Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is also supported.
3. Set `SUPABASE_SERVICE_ROLE_KEY` on the server. This is required for validated enquiry submissions, optional starter import and the integration verification script. Never put this secret in a `NEXT_PUBLIC_` variable, browser code or source control.
4. In Supabase Authentication settings, **disable new user sign-ups**. The website has no registration endpoint or registration interface.
5. Create the owner using Authentication → Users → Add user / Create user. Choose a strong password and mark the owner's email confirmed. Copy the created user UUID.
6. In the SQL Editor, grant that account owner membership:

```sql
insert into public.admin_users (user_id)
values ('REPLACE_WITH_OWNER_USER_UUID');
```

7. Set the Supabase Authentication Site URL to your deployed site, restart the app, and sign in at `/admin`. Authentication alone does not grant dashboard access: the account must be in `admin_users`. Owner membership cannot be changed by browser clients or user metadata. To revoke owner access, delete that membership row in the SQL Editor.

Once Supabase is configured the database is the source of the portfolio, including when it is empty. A database error does not silently show seed projects. To import the supplied flyer photographs as editable published projects, run this optional, repeat-safe script:

```sh
npx tsx scripts/import-starter-projects.ts
```

Existing projects with the same slug are skipped. The script does not create before-and-after pairs. Add genuine pairs explicitly in the owner dashboard.

## Owner workflow and persistence

Create a draft, add photographs, choose a cover and enter alternative text. Save project details, captions, photo order and comparison pairs; use Preview to check the result, then publish. Published projects require a description, cover photograph and alternative text for every photo. Project order and featured status are editable from the dashboard. Featured projects appear first in the public portfolio; your chosen order is preserved within featured and regular projects. Enquiries appear in a private dashboard tab (the latest 500 are shown; older records remain in the database).

Uploads accept JPEG, PNG and WebP up to 10 MB and 40 megapixels per file, with up to 60 photographs per project. HEIC files must first be exported as JPEG. The server decodes actual bytes, rejects invalid and animated files, applies camera orientation, removes EXIF/GPS metadata, and creates WebP files up to 1920 pixels on their longest side. Originals are not retained by this application.

Each project can also contain up to **two videos**, including uploads not yet saved. Upload MP4 or WebM files up to 50 MB each in the editor's video section, add optional captions, arrange them, and save. Videos play in the private preview and public project page with native playback controls. Removing a video takes effect on Save; save a removal before uploading its replacement when both slots are occupied. The API validates file size, MIME type and container headers; videos are stored as uploaded, without transcoding or metadata removal. Codec support depends on the visitor's browser; MP4 with H.264 video and AAC audio is a suitable export choice.

Uploads persist immediately, including across devices, but new photographs and videos are pending and invisible to public visitors until saved. Saving uses a single database transaction for the project, photo/video metadata and order, media removal, and comparison pairs. The database enforces the two-video limit even for simultaneous uploads. Deleting a project deletes its database gallery and requests storage cleanup. A failed storage cleanup can leave an inaccessible orphan file in a private bucket; it never restores deleted public content. Review such failures in server logs and remove unused files in the Supabase storage dashboard.

The `project-images` and `project-videos` buckets are **private**. Do not switch them to public. RLS restricts drafts, pending photos/videos, and enquiries and authorises all content writes. Public pages use an anonymous database client even when the owner is signed in. Media URLs are signed for five minutes; an already issued URL or a visitor's downloaded copy cannot be immediately revoked when a project is unpublished. New public reads and new signed URLs are denied immediately. Admin routes, API responses and authenticated session refreshes use private/no-store responses. Keep the portfolio pages dynamic so signed URLs are refreshed on page requests.

## Enquiry delivery

Enquiries are validated on the server and saved before a success response. Name, service and project description are required, together with at least one valid email address or phone number. Protection includes a honeypot, form timing checks, request limits, and database-persisted per-IP and per-contact hourly limits. Anonymous clients cannot write directly to the enquiry table and bypass these checks.

`TRUSTED_PROXY_IP_HEADER` defaults to `x-vercel-forwarded-for`. On other hosts, set it to the IP header your reverse proxy overwrites; do not trust a header passed unchanged from the visitor. When the header is absent, submissions share a conservative rate-limit bucket. `ENQUIRY_RATE_LIMIT_SALT` can hold a stable random secret; otherwise the server service key is used. Only keyed hashes are stored in the rate-limit table, and old buckets are pruned on requests.

Optional email notifications use Resend. Set `RESEND_API_KEY`, `RESEND_FROM_EMAIL` to an address on a verified sending domain, and optionally `RESEND_NOTIFICATION_TO` (defaults to the business email from the flyer). Notifications are sent only after database persistence. A provider failure is logged; the saved enquiry remains visible in the dashboard. No email is sent when the provider is unconfigured.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Browser checks cover responsive navigation, service filters, project pages, form errors, protected API responses and before-and-after controls with mouse, touch and keyboard. With no Supabase environment configured, run:

```sh
npx playwright install chromium
npm run test:browser
```

If Chrome is already installed, use `PLAYWRIGHT_CHROME_CHANNEL=chrome npm run test:browser`. The test runner starts a development preview on port 3100. To use an existing preview, set `PLAYWRIGHT_BASE_URL=http://localhost:3000` to its actual address. Gallery tests use isolated, clearly synthetic fixtures that never appear in the public portfolio. The page tests deliberately check the unconfigured service error; they do not submit a real enquiry.

Tests cover enquiry contact validation and limits, timing protection, publication requirements, comparison integrity, image content validation, resizing and metadata stripping, video container validation, and upload limits and cleanup. The database test executes all SQL migrations and policy assertions using PGlite (real PostgreSQL in-process), with minimal stand-ins for Supabase-owned `auth` and `storage` schemas. It checks role isolation, pending-media privacy, the two-video cap, transactional saves and rollback, gallery ordering, cascade deletion and persistent rate limits. It does not simulate Supabase's authentication service, PostgREST relation discovery or Storage HTTP service; those still require the live checks below.

For actual persistence, storage and RLS verification, set temporary local `GNJ_TEST_OWNER_EMAIL` and `GNJ_TEST_OWNER_PASSWORD` values for an existing owner and run:

```sh
npx tsx scripts/verify-supabase.ts
```

The script reports SKIPPED when credentials are absent. When configured it checks real owner sign-in, a non-owner with forged admin metadata, role-escalation denial, anonymous draft denial, private storage, publish/unpublish, uploads, fresh-session persistence, photo and project order, comparison pairs, enquiry privacy and durable rate limiting. It creates UUID-scoped temporary fixtures and a temporary non-owner account, then removes them. It does not submit the public form or send notification emails. If a run is interrupted, remove the `verification-*` project and `gnj-test-*` account left by that run.

Additional database policy assertions are in `supabase/tests/security.sql` and `supabase/tests/video-security.sql`. Run each through a PostgreSQL connection, for example `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/video-security.sql`. They run in a transaction and roll back their test data. Do not claim these integration checks passed until they have run against your configured database.

Finally, verify on the deployed URL: mobile navigation, service filters, a real enquiry appearing in the dashboard, owner sign-in/sign-out, a saved draft remaining inaccessible when signed out, multi-file uploads and reordering surviving refresh, publish/unpublish, and a genuine before-and-after pair with keyboard/touch slider and full-photo side-by-side views. Form email notifications require a configured provider to verify end to end.

## Deployment

Deploy as a Node.js Next.js application, for example on Vercel. Use `npm run build` and `npm run start` on a self-managed host. Add the production environment variables in the hosting dashboard and set `NEXT_PUBLIC_SITE_URL` to the real HTTPS origin before building. Public variables are embedded at build time. Install the Supabase migration and create owner membership before enabling submissions. Use HTTPS, keep service keys server-side, and do not cache `/admin` or `/api/admin` at a reverse proxy.

The upload routes accept photographs up to 10 MB and videos up to 50 MB. The host and any reverse proxy must accept those request sizes plus multipart overhead and allow sufficient upload time. Vercel Functions have a [request-body limit](https://vercel.com/docs/functions/limitations#request-body-size) below these advertised limits; use a suitable Node host or lower the UI/server limits to match the deployment. Keep both storage buckets private.

Outstanding external setup: a Supabase project and keys, migrated database, owner account, deployed site URL, and optionally a verified email provider and confirmed service area. Without those credentials, local UI and validation checks can run but live authentication, database persistence and email delivery cannot be fully verified.
