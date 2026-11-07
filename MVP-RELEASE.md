# InHayat MVP release

## Shipped in this release

- Teal heart/pulse SVG favicon and PNG Apple touch icon, served by Next.js metadata routes.
- Browser-local clinic bookmarks with saved-only filtering. Only public clinic names are stored; there is no account synchronization.
- Compare up to three clinics independently of directory filters, remove/clear selections, and export public contact/address/directions as a UTF-8 text file. No appointments, pricing or clinical suitability are inferred.
- Verification: icon endpoints return 200 with SVG/PNG content types; homepage includes icon links and bookmark controls; production build and existing nine tests pass. Interactive bookmark/comparison browser QA was unavailable because the webview did not attach.

- Google HTML verification file at `/google1742a5207a5cd42b.html` (the downloaded `(1)` suffix is not part of the public filename).
- Address-based Google map embedded after loading it, plus directions/search links tied to regional filters. These are address searches, not independently surveyed clinic coordinates.
- Responsive map panel, visible keyboard focus and reduced-motion support.
- Frame-embedding protection, MIME sniffing protection, no-referrer, restricted browser permissions and API no-store headers. CSP is deliberately a baseline; it does not yet restrict script sources.
- Document completion endpoint checks authenticated case ownership, private object prefix, actual R2 size and file signature before inserting metadata through the normal application flow.

### Security verification limits

Live R2 completion still needs an authenticated staging upload. File signatures are format checks, not antivirus scanning. Existing patient-owned direct Supabase insert policies remain in place; the completion endpoint is not a database-enforced guarantee that every row has passed content validation. A future server-only insert policy and service-role-backed completion flow should be introduced together. Distributed upload rate limiting and orphan-object cleanup are not part of this release.

- Google Search Console HTML verification meta tag on the public homepage.
- Canonical URL, social metadata, robots.txt and sitemap.xml.
- No-index metadata for cabinet, admin and password reset pages.
- Per-case preparation checklist stored in Supabase with ownership policies.
- Cabinet waits for case loading and handles initial session failure.
- Stable budget number formatting prevents server/browser hydration mismatch.

## Required deployment steps

1. Run `backend/supabase/003_preparation_progress.sql` in the existing Supabase project after the first two migrations. Without it, the checklist displays a load/save error; it never pretends to save locally.
2. Deploy the GitHub revision to Vercel.
3. Search Console: select URL-prefix property `https://www.inhayat.uz/`, choose HTML tag verification, then verify. For a Domain property, Google requires adding the supplied `google-site-verification=...` TXT value in DNS instead of an HTML tag.
4. Submit `https://www.inhayat.uz/sitemap.xml`. Indexing timing is controlled by Google.

## Launch gates not confirmed by a successful build

- Supabase Site URL and allowed redirect URLs must use the production origin. Test Google sign-in through account selection until a persistent cabinet session exists. Previous localhost fallback is not resolved by SEO changes.
- Apply database migrations and verify checklist persistence with two separate patient accounts, including denied cross-account access.
- Configure private R2 credentials and bucket CORS on Vercel; verify a real document upload. No public medical-file URLs.
- Reconfirm clinic contacts and service availability with the institutions; directory data does not establish a partnership or guarantee appointments.
- Document viewing/downloading and clinical review/waitlist integration are not implemented in this release. Do not advertise a live waitlist or automated medical matching.

The source is prepared for this MVP iteration; the launch gates above must pass before calling the live service production-ready.
