# SEO implementation and deployment

The confirmed business domain is **https://www.gnjgarden.com**. GNJ serves **Huntingdon, Huntingdonshire, Cambridgeshire and locations within 50 miles of Huntingdon**. These defaults were confirmed by the owner on 19 October 2026. Existing published projects and their URLs are preserved.

## What changed

- Four useful service pages cover garden landscaping/patios/paving, flooring installation/soundproofing, bathroom/toilet renovations and plumbing/radiator replacement. They explain scope, preparation, common questions and relevant published work, with links between related services.
- `/services`, `/projects` and `/contact` give visitors and crawlers stable destinations. Every published project is linked in the server-rendered project directory, without JavaScript or a “View all” click. Existing home-page anchors and filtering continue to work.
- Public pages have individual titles, descriptions, canonical URLs, Open Graph and Twitter metadata. Project metadata and page rendering share a request-scoped database lookup. No existing project slugs are renamed, avoiding broken inbound links.
- Business, Service, BreadcrumbList, CollectionPage and CreativeWork structured data describe visible content. No ratings, certifications, street address, opening hours, job dates or invented project locations have been added. This markup does not promise rich-result eligibility; Google's LocalBusiness features have additional requirements, including an appropriate verified address.
- The sitemap includes services, contact, the project directory, published projects and their images. Project modification dates come from saved records. Backend failure is surfaced instead of silently replacing the sitemap with a truncated success response.
- Published project photographs have descriptive, stable same-origin URLs instead of five-minute signed URLs. Public metadata, project pages and the image sitemap use these URLs. Original private bucket paths and owner photo access are unchanged.
- The first project photograph loads eagerly; later photographs remain lazy. Uploads already produce resized, compressed WebP files and remove EXIF. The new route serves those existing bytes without introducing a second lossy conversion.

## Production settings

| Variable | Value or purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://www.gnjgarden.com` (also the default). Set before building; never use localhost for production. |
| `NEXT_PUBLIC_SERVICE_AREA` | Optional override of the confirmed 50-mile Huntingdon coverage. Public variables are embedded at build time. |
| `GOOGLE_SITE_VERIFICATION` | Optional HTML verification token provided by Google Search Console. DNS verification can be used instead. |
| `SEO_NOINDEX` | Set `true` on staging sites; leave unset or `false` on production. |
| `VERCEL_ENV` | Vercel preview deployments are automatically noindex with a disallow-all robots policy. Production is eligible for indexing. |

An explicitly empty origin also disables indexing. Invalid origins with paths, credentials, queries or non-HTTP protocols fail configuration validation. Ensure apex and HTTP domain variants redirect to the canonical HTTPS/www domain in the hosting settings. This change does not alter DNS, hosting redirects or Search Console accounts.

### Published photograph access

`/project-images/<project UUID>/<image UUID>/<descriptive-name>.webp` uses the anonymous Supabase client. It checks the project/image relationship, publication and pending state before downloading from the private bucket under existing RLS policies. It never accepts arbitrary storage paths or external URLs from request parameters and never uses a service-role key.

Responses use `Cache-Control: private, no-store` so shared caches cannot continue distributing an unpublished photograph. Publication checks run again on subsequent requests. Incorrect filenames redirect to the current descriptive filename after the access check. Already downloaded files cannot be recalled, just as with any published website photograph. This deliberately prioritizes revocation over CDN caching; monitor origin traffic as the portfolio grows.

Videos retain the existing signed delivery. Captions, transcripts, truthful per-video descriptions and stable video delivery are separate follow-up work if video search becomes a priority. The implementation does not fabricate video duration or upload dates to claim video rich results.

## Validation

```sh
npm test
npm run lint
npm run typecheck
npm run build -- --webpack
npx playwright install firefox
npm run test:seo
```

The Firefox SEO suite builds and starts an isolated production server on port 3200 with Supabase disabled, using the genuine supplied starter photos. It verifies metadata, canonicals, structured-data JSON, all project links without JavaScript, sitemap images, mobile overflow, contact labels, gallery keyboard behavior and 404s. It does not submit enquiries. Set `PLAYWRIGHT_BROWSERS_PATH` if using an existing custom Firefox installation.

Unit and database tests cover URL normalization, preview noindex behavior, sitemap inclusion, JSON-LD escaping, stable filenames, public/private media separation, pending/draft denial, unpublish revocation and the existing RLS policies. A fixture test does not prove connectivity to the deployed Supabase instance; verify a real published image after deployment.

## After deployment

1. Confirm the live home page, every service page and a project page return 200 with the intended canonical and no accidental `noindex`. Check unknown pages return 404.
2. Open `/robots.txt` and `/sitemap.xml`; confirm production-domain URLs, current published projects and accessible image URLs. Test a published photo in a signed-out browser.
3. Verify the domain in Google Search Console, submit `https://www.gnjgarden.com/sitemap.xml` and inspect the main service URLs and representative projects. Google controls crawling and indexing; submission does not guarantee inclusion or rank.
4. Maintain the business's genuine Google Business Profile with accurate contact details, service categories and the actual service area. Do not create a fake public office address or city listings where GNJ has no legitimate presence. Request honest customer reviews through the business's normal process.
5. Improve project records with factual descriptions: what changed, materials and scope, a non-sensitive town/locality when appropriate, and relevant image alt text/captions. Do not publish customer addresses or identify clients without permission. Keep old project URLs stable.
6. Record a Search Console baseline, then review impressions, clicks, click-through rate and average position by service page and query. Example query groups include “patio installation Huntingdon”, “garden landscaping Huntingdon”, “laminate flooring Huntingdon”, “bathroom renovations Huntingdon” and “plumbing Huntingdon”. These are targeting examples, not measured keyword volumes or ranking claims.
7. Use field Core Web Vitals and actual enquiries to assess usability and results. Review indexing and performance over subsequent weeks; adjust content using real queries and customer questions. Rankings vary by location, competition and search intent. No top-ten placement is guaranteed by this release.

Guidance: [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), [Google image SEO](https://developers.google.com/search/docs/appearance/google-images), [LocalBusiness structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business).
