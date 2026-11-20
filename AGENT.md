# Local monitor

The admin monitor in this handoff build is intentionally offline. It uses only local backend tools and local demo records. It does not call Anthropic, OpenAI, Google, SMS, Supabase, Cloudflare R2, or any other external service.

Audit entries are stored in the local demo database at `backend/.demo-data/db.json`.
