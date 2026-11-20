# LifeBridge / InHayat

LifeBridge is a local demo platform for coordinating transplant preparation across Uzbekistan. This handoff build is intentionally isolated:

- no Supabase, Cloudflare R2, Google, Anthropic, OpenAI, SMS, or other external API connections;
- all accounts, metadata, uploaded files, and audit records stay in `backend/.demo-data/`;
- the AI monitor uses a local rule-based provider and never sends data outside the machine.

## Run locally

```bash
npm run setup
npm run dev
```

The patient site runs at `http://localhost:3000`, the staff portal at `http://localhost:3001`, and the local backend at `http://localhost:4000`.

Demo accounts are shown on the login screens. Do not enter real medical information into this demo.

To clear local demo records:

```bash
npm run demo:reset
```

## Project layout

- `frontend/` — patient site
- `portal/` — staff portal
- `backend/` — local API, demo repository, local file storage, and offline monitor

Only example environment files belong in source control. The optional encrypted pilot, private R2 storage and Gemini setup are documented in [PILOT.md](PILOT.md).
