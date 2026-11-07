# Catalog, Google login and administrator setup

## Database

For an existing installation, run `backend/supabase/002_catalog_auth_admin.sql` in the Supabase SQL Editor. For a new installation, run `backend/supabase/schema.sql` first, then the migration. The migration adds the hematology centre, five regional clinics, automatic patient profiles for Google/email users and catalog administrator policies.

Until the migration is applied, the public website uses the included official-source catalog. After migration, active rows come from Supabase and the admin editor controls public visibility.

## Google login

### Redirect correction (2026-10-18)

The app now returns to the origin where login started, and handles OAuth tokens even if Supabase returns to the root page. After the SDK finishes saving the session, credentials are removed from the address bar and the user is sent to `/cabinet` (or `/admin` if login started there).

In Supabase → Authentication → URL Configuration:

- Production Site URL: `https://www.inhayat.uz` (replace with the actual canonical domain if different).
- Redirect URLs: `https://www.inhayat.uz/cabinet`, `https://www.inhayat.uz/admin`, `https://www.inhayat.uz/reset-password`.
- Local development: `http://localhost:3000/cabinet`, `http://localhost:3000/admin`, `http://localhost:3000/reset-password`. Add corresponding URLs for any other port you use.
- If both apex and www domains serve the app, add the three paths for both origins, or redirect consistently to the canonical origin BEFORE starting login.

These are frontend return URLs in Supabase; Google's authorized redirect URI remains the Supabase `/auth/v1/callback` URL below. An unexpected return to `localhost:3000` when using the production website indicates that the cloud Site URL/allowlist also needs correction. Code changes on the production host cannot intercept callbacks already sent to a different origin.

Never paste a real callback URL with access, provider or refresh tokens into logs, screenshots or support messages. After a shared callback, sign out and sign in again.

1. In Google Cloud Console, configure OAuth consent and create a Web Application OAuth client.
2. Add the Supabase project's callback URL (`https://YOUR_PROJECT.supabase.co/auth/v1/callback`) as an authorized redirect URI in Google Cloud.
3. In Supabase → Authentication → Sign In / Providers → Google, enable Google and enter the client ID and client secret. Keep the client secret there; do not place it in the frontend or a `NEXT_PUBLIC_` variable.
4. In Supabase → Authentication → URL Configuration, set Site URL to the Vercel/custom production domain. Add production `/cabinet`, `/admin`, and `/reset-password` URLs to the redirect allowlist. For local development, also add the relevant localhost URLs.
5. Email/password login works through Supabase email provider; email registration may require a confirmation link. Phone login requires a configured SMS provider.

Reference: https://supabase.com/docs/guides/auth/social-login/auth-google

## Admin role

`/admin` uses the same login screen, but both the UI and database policies require `app_metadata.role = admin`. Ordinary registrations cannot assign this role.

A project owner can assign it to a specific already registered user using this SQL in the trusted Supabase SQL Editor (replace `ADMIN_USER_UUID`):

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where id = 'ADMIN_USER_UUID'::uuid;
```

The user must sign out and sign in again to refresh the JWT. Never put a service-role key in frontend code. The panel manages catalogue entries only; it does not expose patients' medical documents.

## Uploads

R2 credentials must be configured server-side. Use a private bucket and allow browser PUT from the actual frontend origin through bucket CORS. Client uploads accept PDF/JPG/PNG up to 10 MB. No public medical document URL is generated.

## Verified state on 2026-10-17

Read-only checks against the configured Supabase project returned: email provider enabled; Google and phone providers disabled; new clinics table and centre speciality column not yet installed. No cloud authentication settings or database schema were changed in this work. Complete the steps above before testing real OAuth, admin saves, and R2 uploads.

## Hero image

`public/doctor-portrait.png` was generated with built-in ImageGen. Prompt: "Portrait website hero photograph of an Uzbek woman doctor age 30–40 wearing a clean white medical coat over teal scrubs with a stethoscope around her neck; centered waist-up composition, contemporary bright clinic, ivory curtains and pale sage background, natural morning light, no text, logos or watermark." This is an illustrative image, not an actual listed clinician.
