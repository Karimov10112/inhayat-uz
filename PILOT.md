# InHayat pilot

The three services develop together with `npm run setup` and `npm run dev`. The synthetic demo uses localhost ports 3000 (patient), 3001 (staff) and 4000 (API).

For a controlled pilot, send `www.inhayat.uz` to the patient site and `pro.inhayat.uz` to the staff site. Redirect the apex `inhayat.uz` to `www.inhayat.uz`. Set `BACKEND_INTERNAL_URL` on both Next.js apps to the reachable private backend URL. Both proxy `/api/*` to the backend. Staff pages instruct crawlers not to index them.

The repository-root `vercel.json` blocks automatic production deployments from the legacy root-level Vercel project. For a Vercel rollout, use project roots `frontend` and `portal`, set their backend URL, and validate both previews against the deployed API before assigning the production domains or re-enabling root-level production builds.

Run the Express API as one Node.js process with a persistent volume. Set `INHAYAT_MODE=pilot`, a new isolated absolute `DATA_DIR`, and independent random 32-byte hex values for `DEMO_SECRET` and `DATA_ENCRYPTION_KEY`. Supply `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` (16–128 characters) for initial provisioning. Remove the provisioning credentials after confirming sign-in. With pilot mode, the backend starts without seeded demo users, sample records, or the demo reset endpoint. Back up the encrypted database and retain its key separately. This pilot uses a single-process file store for metadata and in-memory notifications. It requires a durable shared database and notification service before scaling across processes.

Create a private R2 bucket and restrict its object read/write credentials to that bucket. Set the four `R2_*` values from `backend/.env.example`. The API verifies uploads and encrypts file bytes before sending them to R2. Keep public access off. The browser only uses the API paths, so this integration does not require bucket CORS. Keep upload and download grant URLs out of access logs. The 10 MB limit requires a hosting ingress that supports that request size, or a lower configured application limit at deployment.

Point Cloudflare at the intended hosts, restrict origin access to the reverse proxy or Tunnel, and apply managed WAF protection and edge rate rules for authentication, document and assistant routes. Bypass edge caching on `/api/*`. Preserve mail records during DNS changes. Only set `TRUST_PROXY_CIDRS` to controlled proxies that overwrite forwarding headers. Test from outside the network that the private origin cannot be bypassed.

Set `GEMINI_API_KEY` and `GEMINI_MODEL` to enable optional rewriting of the built-in platform guide. The API sends only the predefined guide text. Personal counts are calculated separately on the backend and returned to the signed-in user. The assistant does not interpret medical records. In-app alerts poll every 10 seconds while open and sound after the user enables audio.

Validate with synthetic records first. Production use of real patient data requires deployment verification, a durable database and backups, operational access controls and a clinical/privacy review.
