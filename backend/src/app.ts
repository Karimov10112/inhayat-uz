import { createClient } from "@supabase/supabase-js";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { decideAction, cleanHistory, runAgent } from "./agent/agent.js";
import { scanPlatform } from "./agent/monitor.js";
import { providerFromEnv, type ModelProvider } from "./agent/providers.js";
import type { AgentContext } from "./agent/tools.js";
import { issueToken, readToken } from "./auth.js";
import { DemoRepo } from "./repo/demo-repo.js";
import { DEMO_ACCOUNTS } from "./repo/demo-seed.js";
import type { Repo } from "./repo/repo.js";
import { SupabaseRepo } from "./repo/supabase-repo.js";
import { LocalStore, R2Store, localStoreAt, type FileStore } from "./storage.js";
import { CASE_STATUSES, DOC_KINDS, HttpError, PATHWAYS, type Actor, type CaseStatus, type DocKind, type NoteKind, type Pathway, type StaffInput, type StaffStatus } from "./types.js";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_TTL = 7 * 24 * 3600;

export function validDocument(bytes: Uint8Array, mime: string) {
  if (!bytes.length) return false;
  if (mime === "application/pdf") return [0x25, 0x50, 0x44, 0x46, 0x2d].every((value, index) => bytes[index] === value);
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  return false;
}

const validUrl = (value?: string) => !!value && /^https:\/\/[^\s]+$/.test(value.trim());

export interface AppOptions {
  env?: NodeJS.ProcessEnv;
  /** Folder for demo data (db.json + files). null = in-memory (tests). */
  dataDir?: string | null;
  provider?: ModelProvider;
}

type Ctx = { actor: Actor; repo: Repo };
type Handler = (req: Request, res: Response, ctx: Ctx) => Promise<unknown>;

export function createApp(options: AppOptions = {}) {
  const env = options.env ?? process.env;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const mode: "supabase" | "demo" = validUrl(supabaseUrl) && supabaseKey && supabaseKey.length > 20 ? "supabase" : "demo";
  const dataDir = options.dataDir === undefined ? join(process.cwd(), ".demo-data") : options.dataDir;

  const r2Ready = [env.R2_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, env.R2_BUCKET].every(v => v && v.trim().length > 2);
  const store: FileStore = r2Ready
    ? new R2Store(env.R2_ACCOUNT_ID!.trim(), env.R2_ACCESS_KEY_ID!.trim(), env.R2_SECRET_ACCESS_KEY!.trim(), env.R2_BUCKET!.trim())
    : localStoreAt(dataDir ?? join(process.cwd(), ".demo-data-mem"));
  const demo = mode === "demo"
    ? new DemoRepo(dataDir ? join(dataDir, "db.json") : null, (key, content) => { if (store instanceof LocalStore) store.write(key, content, "application/pdf"); })
    : null;
  const provider = options.provider ?? providerFromEnv(env);
  const system = { mode, storage: store.kind, aiProvider: provider.name, startedAt: Date.now() };

  const app = express();
  const origins = (env.FRONTEND_ORIGIN || "http://localhost:3000,http://localhost:3001").split(",").map(o => o.trim()).filter(Boolean);
  app.disable("x-powered-by");
  app.use(cors({ origin: origins }));

  // Raw upload endpoint for demo storage (must come before the JSON parser).
  app.put("/api/files/upload/:token", express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), (req, res) => {
    const grant = readToken<{ op: string; key: string; type: string; size: number }>(String(req.params.token));
    if (!grant || grant.op !== "put" || !(store instanceof LocalStore)) return res.status(403).json({ error: "Yuklash havolasi yaroqsiz yoki muddati o‘tgan." });
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length !== grant.size || req.header("content-type") !== grant.type) return res.status(400).json({ error: "Fayl hajmi yoki turi mos emas." });
    store.write(grant.key, body, grant.type);
    return res.status(200).end();
  });

  app.get("/api/files/view/:token", (req, res) => {
    const grant = readToken<{ op: string; key: string; name: string; type: string }>(String(req.params.token));
    if (!grant || grant.op !== "get" || !(store instanceof LocalStore)) return res.status(403).send("Havola yaroqsiz yoki muddati o‘tgan.");
    const file = store.read(grant.key);
    if (!file) return res.status(404).send("Fayl topilmadi.");
    res.setHeader("content-type", grant.type);
    res.setHeader("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(grant.name)}`);
    res.setHeader("cache-control", "private, no-store");
    res.setHeader("x-content-type-options", "nosniff");
    return res.send(file);
  });

  app.use(express.json({ limit: "256kb" }));

  // --------------------------------------------------------------- helpers
  async function authenticate(req: Request): Promise<Ctx | null> {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ") || header.length < 20) return null;
    const token = header.slice(7);
    if (demo) {
      const data = readToken<{ sub: string; typ: string }>(token);
      const user = data?.typ === "session" ? demo.getUser(data.sub) : null;
      return user ? { actor: { id: user.id, isAdmin: user.is_admin, email: user.email, phone: user.phone }, repo: demo } : null;
    }
    const client = createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) return null;
    return { actor: { id: user.id, isAdmin: user.app_metadata?.role === "admin", email: user.email ?? "", phone: String(user.user_metadata?.phone ?? user.phone ?? "") }, repo: new SupabaseRepo(client) };
  }

  const route = (handler: Handler) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = await authenticate(req);
      if (!ctx) return res.status(401).json({ error: "Hisobingizga qayta kiring." });
      const result = await handler(req, res, ctx);
      if (!res.headersSent) res.json(result ?? { ok: true });
    } catch (error) { next(error); }
  };
  const admin = (handler: Handler): Handler => (req, res, ctx) => {
    if (!ctx.actor.isAdmin) throw new HttpError(403, "Faqat administrator uchun.");
    return handler(req, res, ctx);
  };
  const text = (value: unknown, max: number, field: string, min = 0) => {
    const v = typeof value === "string" ? value.trim() : "";
    if (v.length < min || v.length > max) throw new HttpError(400, `${field}: noto‘g‘ri qiymat.`);
    return v;
  };
  const uuid = (value: unknown) => {
    const v = String(value ?? "");
    if (!UUID.test(v)) throw new HttpError(400, "Identifikator noto‘g‘ri.");
    return v;
  };
  const agentCtx = (ctx: Ctx): AgentContext => ({ ...ctx, system });

  // --------------------------------------------------------------- public
  app.get("/health", (_req, res) => res.json({ ok: true, service: "inhayat-backend", mode, storage: store.kind, ai: provider.name }));
  app.get("/api/config", (_req, res) => res.json({ mode, storage: store.kind, ai: provider.name, demoAccounts: demo ? DEMO_ACCOUNTS : null }));

  // --------------------------------------------------------------- demo auth
  const phoneOk = (v: unknown) => typeof v === "string" && /^\+998\d{9}$/.test(v);
  const emailOk = (v: unknown) => typeof v === "string" && v.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const loginOf = (body: Record<string, unknown>) => {
    if (body.phone !== undefined) { if (!phoneOk(body.phone)) throw new HttpError(400, "INVALID_PHONE"); return { phone: body.phone as string }; }
    if (!emailOk(body.email)) throw new HttpError(400, "INVALID_EMAIL");
    return { email: (body.email as string).toLowerCase() };
  };
  const session = (user: { id: string; email: string; phone: string; is_admin: boolean }) => ({
    token: issueToken({ sub: user.id, typ: "session" }, SESSION_TTL),
    user: { id: user.id, email: user.email, phone: user.phone, isAdmin: user.is_admin },
  });
  app.post("/api/auth/demo/register", (req, res, next) => {
    try {
      if (!demo) throw new HttpError(404, "Demo rejim o‘chirilgan.");
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const login = loginOf(req.body ?? {});
      if (password.length < (login.email ? 10 : 8) || password.length > 128) throw new HttpError(400, "INVALID_PASSWORD");
      res.json(session(demo.register(login, password)));
    } catch (error) { next(error); }
  });
  app.post("/api/auth/demo/login", (req, res, next) => {
    try {
      if (!demo) throw new HttpError(404, "Demo rejim o‘chirilgan.");
      res.json(session(demo.login(loginOf(req.body ?? {}), String(req.body?.password ?? ""))));
    } catch (error) { next(error); }
  });

  // --------------------------------------------------------------- me
  app.get("/api/me", route(async (_req, _res, { actor, repo }) => ({
    user: actor, profile: await repo.getProfile(actor), staff: await repo.getMyStaff(actor), mode,
  })));

  // --------------------------------------------------------------- patient
  app.put("/api/patient/profile", route((req, _res, { actor, repo }) =>
    repo.updateProfile(actor, { full_name: text(req.body?.full_name, 120, "Ism"), region: text(req.body?.region, 60, "Hudud") })));
  app.get("/api/cases", route((_req, _res, { actor, repo }) => repo.listMyCases(actor)));
  app.post("/api/cases", route((req, _res, { actor, repo }) => {
    const pathway = req.body?.pathway as Pathway;
    if (!PATHWAYS.includes(pathway)) throw new HttpError(400, "Yo‘nalish noto‘g‘ri.");
    return repo.createCase(actor, { pathway, region: text(req.body?.region, 60, "Hudud", 2) });
  }));
  app.get("/api/cases/:id", route((req, _res, { actor, repo }) => repo.getCaseBundle(actor, uuid(req.params.id))));
  app.put("/api/cases/:id/checklist", route(async (req, _res, { actor, repo }) => {
    const list = Array.isArray(req.body?.completed) ? (req.body.completed as unknown[]).filter((v): v is string => typeof v === "string").slice(0, 10) : [];
    return { completed: await repo.setChecklist(actor, uuid(req.params.id), list) };
  }));
  app.put("/api/cases/:id/shares/:staffId", route(async (req, _res, { actor, repo }) => {
    await repo.setShare(actor, uuid(req.params.id), uuid(req.params.staffId), req.body?.active !== false);
  }));
  app.post("/api/cases/:id/notes", route(async (req, _res, { actor, repo }) => {
    const kind = (["message", "document_request", "conclusion"].includes(req.body?.kind) ? req.body.kind : "message") as NoteKind;
    await repo.addNote(actor, uuid(req.params.id), kind, text(req.body?.body, 4000, "Xabar", 1));
  }));
  app.post("/api/cases/:id/status", route(async (req, _res, { actor, repo }) => {
    const status = req.body?.status as CaseStatus;
    if (!CASE_STATUSES.includes(status)) throw new HttpError(400, "Holat noto‘g‘ri.");
    await repo.setCaseStatus(actor, uuid(req.params.id), status);
  }));
  app.get("/api/staff/directory", route((_req, _res, { actor, repo }) => repo.staffDirectory(actor)));

  // --------------------------------------------------------------- documents
  app.post("/api/documents/upload", route(async (req, _res, { actor }) => {
    const { fileName, fileType, fileSize } = req.body || {};
    if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 240 || !ALLOWED_TYPES.has(fileType) || !Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) {
      throw new HttpError(400, "Faqat PDF, JPG yoki PNG va 10 MB gacha bo‘lgan fayllar qabul qilinadi.");
    }
    const objectKey = `patients/${actor.id}/${randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    return { uploadUrl: await store.signUpload(objectKey, fileType, fileSize), objectKey, expiresIn: 300 };
  }));
  app.post("/api/documents/complete", route(async (req, _res, { actor, repo }) => {
    const { objectKey, caseId, originalName } = req.body || {};
    const kind = (DOC_KINDS.includes(req.body?.kind) ? req.body.kind : "lab_result") as DocKind;
    if (typeof objectKey !== "string" || objectKey.length > 500 || !objectKey.startsWith(`patients/${actor.id}/`) || objectKey.includes("..")) throw new HttpError(400, "Hujjat ma’lumotlari noto‘g‘ri.");
    const name = text(originalName, 240, "Fayl nomi", 1);
    const head = await store.head(objectKey);
    if (!head || !head.size || head.size > MAX_UPLOAD_BYTES || !ALLOWED_TYPES.has(head.contentType)) throw new HttpError(400, "Fayl topilmadi yoki ruxsat etilmagan.");
    const prefix = await store.readPrefix(objectKey, 16);
    if (!prefix || !validDocument(prefix, head.contentType)) throw new HttpError(400, "Fayl mazmuni ruxsat etilgan formatga mos emas.");
    await repo.addDocument(actor, { caseId: uuid(caseId), kind, objectKey, originalName: name, mimeType: head.contentType, bytes: head.size });
    return { saved: true };
  }));
  app.get("/api/documents/:id/url", route(async (req, _res, { actor, repo }) => {
    const doc = await repo.openDocument(actor, uuid(req.params.id));
    const safeName = doc.original_name.replace(/[^\p{L}\p{N}._ -]/gu, "_");
    return { url: await store.signView(doc.object_key, safeName, doc.mime_type), expiresIn: 300 };
  }));

  // --------------------------------------------------------------- staff
  app.get("/api/staff/me", route((_req, _res, { actor, repo }) => repo.getMyStaff(actor)));
  app.put("/api/staff/me", route((req, _res, { actor, repo }) => {
    const role = req.body?.role === "coordinator" ? "coordinator" : "doctor";
    const input: StaffInput = {
      full_name: text(req.body?.full_name, 120, "F.I.Sh.", 3), role, speciality: text(req.body?.speciality, 160, "Mutaxassislik"),
      license_number: text(req.body?.license_number, 60, "Litsenziya", 3), organization: text(req.body?.organization, 240, "Muassasa", 3),
      region: text(req.body?.region, 60, "Hudud"), phone: text(req.body?.phone, 30, "Telefon"),
    };
    if (input.phone && !/^\+998\d{9}$/.test(input.phone)) throw new HttpError(400, "Telefon: +998XXXXXXXXX ko‘rinishida.");
    return repo.saveMyStaff(actor, input);
  }));
  app.get("/api/staff/cases", route((_req, _res, { actor, repo }) => repo.listSharedCases(actor)));

  // --------------------------------------------------------------- admin
  app.get("/api/admin/staff", route(admin((_req, _res, { actor, repo }) => repo.listStaff(actor))));
  app.patch("/api/admin/staff/:id", route(admin((req, _res, { actor, repo }) => {
    const status = req.body?.status as StaffStatus;
    if (!["pending", "approved", "rejected", "suspended"].includes(status)) throw new HttpError(400, "Holat noto‘g‘ri.");
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 500) : "";
    if ((status === "rejected" || status === "suspended") && !note) throw new HttpError(400, "Sababini yozing — xodim uni ko‘radi.");
    return repo.reviewStaff(actor, uuid(req.params.id), status, note);
  })));
  app.get("/api/admin/dashboard", route(admin(async (_req, _res, { actor, repo }) => {
    const [stats, cases, staff, activity] = await Promise.all([repo.platformStats(actor), repo.caseOverview(actor), repo.listStaff(actor), repo.recentActivity(actor, 15)]);
    return { stats, cases, activity, alerts: scanPlatform(cases, staff, system), system: { ...system, uptime_minutes: Math.round((Date.now() - system.startedAt) / 60000) } };
  })));
  app.post("/api/admin/demo/reset", route(admin(async () => {
    if (!demo) throw new HttpError(404, "Faqat demo rejimda.");
    demo.reset();
    return { ok: true };
  })));

  // --------------------------------------------------------------- AI agent
  app.post("/api/agent/chat", route(admin(async (req, _res, ctx) => runAgent(agentCtx(ctx), provider, cleanHistory(req.body?.messages)))));
  app.post("/api/agent/actions/:id", route(admin((req, _res, ctx) => decideAction(agentCtx(ctx), String(req.params.id), req.body?.approve === true))));
  app.get("/api/agent/audit", route(admin((_req, _res, { actor, repo }) => repo.listAgentActions(actor, 50))));

  // --------------------------------------------------------------- errors
  app.use((_req: Request, res: Response) => res.status(404).json({ error: "Topilmadi." }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error && typeof error === "object" && "type" in error && (error as { type: string }).type === "entity.too.large") return res.status(413).json({ error: "Fayl juda katta." });
    console.error("Unhandled error", error instanceof Error ? error.message : error);
    return res.status(500).json({ error: "Serverda xatolik. Qayta urinib ko‘ring." });
  });

  return { app, mode, store, demo, system };
}
