# LifeBridge / InHayat

Platform for coordinating pre-transplant preparation across Uzbekistan: a **patient site**, a **staff portal** (doctors, coordinators, admins) and an **API** with an **AI monitoring agent**.

## Demo — 3 buyruq (Supabase kerak emas)

```bash
npm run setup      # barcha paketlarni o‘rnatadi
npm run dev        # backend + bemorlar sayti + portal birga
```

| Sayt | Manzil | Demo hisob |
|---|---|---|
| Bemorlar sayti | http://localhost:3000/cabinet | “Demo bemor sifatida kirish” tugmasi (`+998901234567` / `Demo12345`) |
| Shifokorlar portali | http://localhost:3001 | `doktor@demo.inhayat.uz` / `Demo123456` |
| Platforma admini | http://localhost:3001 | `admin@demo.inhayat.uz` / `Demo123456` |
| Tekshiruvdagi xodim | http://localhost:3001 | `yangi@demo.inhayat.uz` / `Demo123456` |

Portal kirish sahifasida demo hisoblar bir bosishda kirish tugmalari bilan chiqadi.

Supabase kalitlari bo‘sh bo‘lsa, backend **demo rejim**da ishlaydi. Ma’lumotlar `backend/.demo-data/` papkasida saqlanadi (bazasi `db.json`, fayllar `files/` ichida) va unda tayyor bemorlar, shifokorlar, hujjatlar va yozishmalar bor. Bemorlar sayti va portal bitta API'dan foydalanadi, shuning uchun bemor ruxsat bersa, shifokor uni portalda darhol ko‘radi. Demoni boshlang‘ich holatga qaytarish uchun admin panelidagi tugmani bosing yoki `npm run demo:reset` buyrug‘ini ishga tushiring.

> Demo rejimda haqiqiy tibbiy ma’lumot kiritmang. Sayt bu haqda ogohlantirib turadi.

**Haqiqiy bazaga o‘tish:** `backend/.env`, `frontend/.env.local` va `portal/.env.local` fayllariga Supabase URL va anon key'ni yozing. Supabase'da `backend/supabase/` papkasidagi SQL fayllarni 001 dan 005 gacha tartib bilan ishga tushiring. Shundan keyin kodni o‘zgartirmasdan haqiqiy bazaga o‘tiladi. R2 kalitlari qo‘shilsa, fayllar ham Cloudflare R2'ga saqlana boshlaydi. Batafsil: [PORTAL.md](./PORTAL.md), [SETUP.md](./SETUP.md).

**AI agent:** qanday ishlashi, kalit qanday ulanishi va o‘z toolingizni qanday qo‘shish — [AGENT.md](./AGENT.md).

## Architecture

```
frontend/ (3000)  ─┐                      ┌─ DemoRepo     (backend/.demo-data, no setup)
                   ├─ /api ─► backend ─► Repo
portal/   (3001)  ─┘          (4000)      └─ SupabaseRepo (user JWT + RLS)
                                │
                                ├─ FileStore: LocalStore (demo) | R2Store
                                └─ agent/: tools · monitor · Claude / OpenAI-compatible / offline
```

- `frontend/` — patient site (Next.js). All data goes through the backend API; Supabase is used only for sign-in in Supabase mode.
- `portal/` — staff portal: doctor workspace, admin dashboard, staff reviews, AI agent console.
- `backend/src/app.ts` — every route; `repo/` — data layer (demo + Supabase); `agent/` — AI agent; `storage.ts` — files.
- `backend/supabase/` — schema and migrations 001–005 (RLS policies, admin metadata functions, agent audit).
- Tests: `npm test` (frontend unit tests + backend end-to-end API tests: patient → doctor → admin → agent).

Copy `frontend/.env.example` to `frontend/.env.local` and `backend/.env.example` to `backend/.env`. Keep R2 credentials only in the backend environment.

## Production architecture

- **Vercel**: Next.js UI and API routes.
- **Supabase**: authenticated patient profiles, clinical-result metadata, specialist centres, queue snapshots and calculator presets.
- **Cloudflare R2**: encrypted original medical documents and images. Store only object keys and metadata in Supabase; upload through a signed server-side URL.

For production, deploy the frontend and backend separately and set `BACKEND_INTERNAL_URL` in the frontend deployment to the backend origin. Set `FRONTEND_ORIGIN` in the backend to the exact frontend origin.

## First production setup

1. Create a Supabase project and run [`backend/supabase/schema.sql`](./backend/supabase/schema.sql) in the SQL Editor.
2. Enable Supabase Auth → Phone provider, configure the SMS provider, and set the production site URL plus `/cabinet` redirect URL. The cabinet uses real phone OTP, not a demo password.
3. Create a private Cloudflare R2 bucket; configure CORS only for the Vercel production domain and do not make medical files public.
4. Add every value in `.env.example` to Vercel Environment Variables, then deploy from GitHub or run `vercel --prod` after authenticating.

The `/api/documents/upload` route creates a five-minute R2 presigned upload URL only after Supabase user authentication. After the browser upload succeeds, the client must save only the returned R2 object key plus its metadata to `medical_documents`.

## Cabinet flow

`/cabinet` is a real Supabase session flow: phone number + password (stored by Supabase as an internal `user_<digits>@inhayat.internal` login; "Confirm email" must be disabled, see PORTAL.md) → personal case → R2 document upload → optional sharing with a verified doctor. With missing environment variables, it deliberately shows a configuration screen; there is no browser-only fallback account mode.

> This interface is a planning aid. Eligibility, waiting-list position and treatment decisions must be confirmed by licensed clinicians and the respective medical centre.
