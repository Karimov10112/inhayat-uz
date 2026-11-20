import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { decideAction, cleanHistory, runAgent } from "./agent/agent.js";
import { scanPlatform } from "./agent/monitor.js";
import { OfflineProvider, type ModelProvider } from "./agent/providers.js";
import type { AgentContext } from "./agent/tools.js";
import { issueToken, readToken } from "./auth.js";
import { DemoRepo } from "./repo/demo-repo.js";
import { DEMO_ACCOUNTS } from "./repo/demo-seed.js";
import type { Repo } from "./repo/repo.js";
import { R2Store, localStoreAt } from "./storage.js";
import { dataCipher } from "./encryption.js";
import { patientGuide } from "./patient-guide.js";
import { CASE_STATUSES, DOC_KINDS, HttpError, PATHWAYS, type Actor, type CaseStatus, type DocKind, type NoteKind, type Pathway, type StaffInput, type StaffStatus } from "./types.js";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_TTL = 12 * 3600;

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
  const pilot = env.INHAYAT_MODE === "pilot";
  if (env.NODE_ENV === "production" && !pilot) throw new Error("Set INHAYAT_MODE=pilot for a production backend.");
  const mode = pilot ? "pilot" : "demo";
  const dataDir = options.dataDir === undefined ? env.DATA_DIR || join(process.cwd(), ".demo-data") : options.dataDir;
  const cipher = dataCipher(env.DATA_ENCRYPTION_KEY);
  if (pilot && (!env.DATA_DIR || !cipher || !/^[a-f0-9]{64}$/i.test(env.DEMO_SECRET ?? ""))) throw new Error("Pilot requires DATA_DIR, DATA_ENCRYPTION_KEY and a 64-hex DEMO_SECRET.");
  const store = localStoreAt(dataDir ?? join(process.cwd(), ".demo-data-mem"), cipher);
  const r2 = env.R2_BUCKET && cipher ? new R2Store(env, env.R2_BUCKET, cipher) : null;
  if (env.R2_BUCKET && !r2) throw new Error("R2 requires DATA_ENCRYPTION_KEY.");
  const demo = new DemoRepo(dataDir ? join(dataDir, cipher ? "db.encrypted" : "db.json") : null, (key, content) => store.write(key, content, "application/pdf"), cipher, !pilot);
  if (pilot && env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.ADMIN_EMAIL) || env.ADMIN_EMAIL.length > 160 || env.ADMIN_PASSWORD.length < 16 || env.ADMIN_PASSWORD.length > 128) throw new Error("Invalid pilot administrator configuration.");
    demo.bootstrapAdmin(env.ADMIN_EMAIL.toLowerCase(), env.ADMIN_PASSWORD);
  }
  const provider = options.provider ?? new OfflineProvider();
  const system = { mode, storage: r2 ? "r2" : store.kind, aiProvider: provider.name, startedAt: Date.now() };
  const epoch = randomUUID();
  let sequence = 0;
  const events: { id: number; caseId: string; author: string; kind: "message" | "document" | "status" }[] = [];
  function notify(caseId: string, author: string, kind: (typeof events)[number]["kind"]) {
    events.push({ id: ++sequence, caseId, author, kind });
    if (events.length > 500) events.shift();
  }
  const isR2Key = (key: string) => key.split("/").at(-1)?.startsWith("r2-");

  const app = express();
  const origins = (env.FRONTEND_ORIGIN || "http://localhost:3000,http://localhost:3001").split(",").map(o => o.trim()).filter(Boolean);
  app.disable("x-powered-by");
  if (env.TRUST_PROXY_CIDRS) app.set("trust proxy", env.TRUST_PROXY_CIDRS.split(",").map(value => value.trim()));
  app.use(helmet({ strictTransportSecurity: pilot }));
  app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); });
  const limit = (max: number, windowMs = 60000) => rateLimit({ limit: max, windowMs, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "So‘rovlar ko‘paydi. Birozdan keyin qayta urinib ko‘ring." }, validate: { xForwardedForHeader: false } });
  app.use("/api", limit(300));
  app.use("/api/auth", limit(20, 600000));
  app.use("/api/files", limit(40));
  app.use("/api/assistant", limit(12));
  let activeFileRequests = 0;
  app.use(["/api/files", "/api/documents/complete"], (_req, res, next) => {
    if (activeFileRequests >= 12) return res.status(503).json({ error: "Hujjat ombori band. Birozdan keyin qayta urinib ko‘ring." });
    activeFileRequests++;
    res.once("close", () => { activeFileRequests--; });
    next();
  });
  app.use(cors({
    origin: (origin, callback) => {
      callback(null, !origin || origins.includes(origin));
    },
    credentials: true,
  }));

  // Raw upload endpoint for demo storage (must come before the JSON parser).
  app.put("/api/files/upload/:token", express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES, inflate: false }), async (req, res) => {
    const grant = readToken<{ op: string; key: string; type: string; size: number }>(String(req.params.token));
    if (!grant || grant.op !== "put") return res.status(403).json({ error: "Yuklash havolasi yaroqsiz yoki muddati o‘tgan." });
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length !== grant.size || req.header("content-type") !== grant.type) return res.status(400).json({ error: "Fayl hajmi yoki turi mos emas." });
    try {
      if (r2 && isR2Key(grant.key)) await r2.write(grant.key, body, grant.type);
      else if (!isR2Key(grant.key)) store.write(grant.key, body, grant.type, true);
      else throw new HttpError(503, "Hujjat ombori vaqtincha ishlamayapti.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST" || (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412) return res.status(409).json({ error: "Fayl avval yuklangan." });
      throw error;
    }
    return res.status(200).end();
  });

  app.get("/api/files/view/:token", async (req, res) => {
    const grant = readToken<{ op: string; documentId: string; viewer: string }>(String(req.params.token));
    const user = grant && demo.getUser(grant.viewer);
    if (!grant || grant.op !== "get" || !user) return res.status(403).send("Havola yaroqsiz yoki muddati o‘tgan.");
    const doc = demo.documentForActor({ id: user.id, isAdmin: user.is_admin, email: user.email, phone: user.phone }, grant.documentId);
    const file = isR2Key(doc.object_key) ? (await r2?.read(doc.object_key))?.body : store.read(doc.object_key);
    if (!file) return res.status(404).send("Fayl topilmadi.");
    const safeName = doc.original_name.replace(/[^\p{L}\p{N}._ -]/gu, "_");
    res.setHeader("content-type", doc.mime_type);
    res.setHeader("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    res.setHeader("cache-control", "private, no-store");
    res.setHeader("x-content-type-options", "nosniff");
    return res.send(file);
  });

  app.use(express.json({ limit: "64kb", inflate: false }));

  // --------------------------------------------------------------- helpers
  async function authenticate(req: Request): Promise<Ctx | null> {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ") || header.length < 20 || header.length > 1024) return null;
    const token = header.slice(7);
    const data = readToken<{ sub: string; typ: string }>(token);
    const user = data?.typ === "session" ? demo.getUser(data.sub) : null;
    return user ? { actor: { id: user.id, isAdmin: user.is_admin, email: user.email, phone: user.phone }, repo: demo } : null;
    /* External authentication removed for handoff.
    const client = createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) return null;
    return { actor: { id: user.id, isAdmin: user.app_metadata?.role === "admin", email: user.email ?? "", phone: String(user.user_metadata?.phone ?? user.phone ?? "") }, repo: new SupabaseRepo(client) };
    */
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
  app.get("/health", (_req, res) => res.json({ ok: true, service: "inhayat-backend", mode, storage: system.storage, ai: provider.name }));
  app.get("/api/config", (_req, res) => res.json({ mode, storage: system.storage, ai: provider.name, demoAccounts: pilot ? null : DEMO_ACCOUNTS }));

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
      const password = req.body?.password;
      if (typeof password !== "string" || !password || password.length > 128) throw new HttpError(401, "INVALID_CREDENTIALS");
      res.json(session(demo.login(loginOf(req.body ?? {}), password)));
    } catch (error) { next(error); }
  });

  // --------------------------------------------------------------- me
  app.get("/api/me", route(async (_req, _res, { actor, repo }) => ({
    user: actor, profile: await repo.getProfile(actor), staff: await repo.getMyStaff(actor), mode,
  })));
  app.get("/api/notifications", route(async (req, _res, { actor }) => {
    const after = typeof req.query.after === "string" ? req.query.after : "";
    const previous = after.startsWith(epoch + ":") ? Number(after.slice(epoch.length + 1)) : sequence;
    const kinds = events.filter(event => event.id > previous && event.author !== actor.id && demo.canAccessCase(actor, event.caseId)).map(event => event.kind);
    return { cursor: `${epoch}:${sequence}`, kinds };
  }));
  app.get("/api/assistant", route(async (req, _res, { actor, repo }) => {
    const cases = await repo.listMyCases(actor);
    const stats = { total: cases.length, active: cases.filter(item => item.status !== "closed").length };
    return { stats, ...await patientGuide(req.query.topic, env) };
  }));

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
    const caseId = uuid(req.params.id);
    await repo.addNote(actor, caseId, kind, text(req.body?.body, 4000, "Xabar", 1));
    notify(caseId, actor.id, "message");
  }));
  app.post("/api/cases/:id/status", route(async (req, _res, { actor, repo }) => {
    const status = req.body?.status as CaseStatus;
    if (!CASE_STATUSES.includes(status)) throw new HttpError(400, "Holat noto‘g‘ri.");
    const caseId = uuid(req.params.id);
    await repo.setCaseStatus(actor, caseId, status);
    notify(caseId, actor.id, "status");
  }));
  app.get("/api/staff/directory", route((_req, _res, { actor, repo }) => repo.staffDirectory(actor)));

  // --------------------------------------------------------------- documents
  app.post("/api/documents/upload", route(async (req, _res, { actor }) => {
    const { fileName, fileType, fileSize } = req.body || {};
    if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 240 || !ALLOWED_TYPES.has(fileType) || !Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) {
      throw new HttpError(400, "Faqat PDF, JPG yoki PNG va 10 MB gacha bo‘lgan fayllar qabul qilinadi.");
    }
    const objectKey = `patients/${actor.id}/${r2 ? "r2-" : ""}${randomUUID()}`;
    return { uploadUrl: await store.signUpload(objectKey, fileType, fileSize), objectKey, expiresIn: 300 };
  }));
  app.post("/api/documents/complete", route(async (req, _res, { actor, repo }) => {
    const { objectKey, caseId, originalName } = req.body || {};
    const kind = (DOC_KINDS.includes(req.body?.kind) ? req.body.kind : "lab_result") as DocKind;
    if (typeof objectKey !== "string" || objectKey.length > 500 || !objectKey.startsWith(`patients/${actor.id}/`) || objectKey.includes("..")) throw new HttpError(400, "Hujjat ma’lumotlari noto‘g‘ri.");
    const name = text(originalName, 240, "Fayl nomi", 1);
    const id = uuid(caseId);
    if (!(await repo.listMyCases(actor)).some(item => item.id === id)) throw new HttpError(404, "Yo‘l xaritasi topilmadi.");
    const remote = isR2Key(objectKey);
    const object = remote ? await r2?.read(objectKey) : null;
    const head = remote ? (object && { size: object.body.length, contentType: object.mime }) : await store.head(objectKey);
    if (!head || !head.size || head.size > MAX_UPLOAD_BYTES || !ALLOWED_TYPES.has(head.contentType)) throw new HttpError(400, "Fayl topilmadi yoki ruxsat etilmagan.");
    const prefix = remote ? object?.body.subarray(0, 16) : await store.readPrefix(objectKey, 16);
    if (!prefix || !validDocument(prefix, head.contentType)) throw new HttpError(400, "Fayl mazmuni ruxsat etilgan formatga mos emas.");
    if (await repo.addDocument(actor, { caseId: id, kind, objectKey, originalName: name, mimeType: head.contentType, bytes: head.size }) !== false) notify(id, actor.id, "document");
    return { saved: true };
  }));
  app.get("/api/documents/:id/url", route(async (req, _res, { actor, repo }) => {
    const doc = await repo.openDocument(actor, uuid(req.params.id));
    const grant = issueToken({ op: "get", documentId: doc.id, viewer: actor.id }, 60);
    return { url: `/api/files/view/${grant}`, expiresIn: 60 };
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
    const status = (error as { status?: number } | null)?.status;
    if (status === 400 || status === 415) return res.status(status).json({ error: "So‘rov formati noto‘g‘ri." });
    console.error("Unhandled API error", error instanceof Error ? error.name : "Unknown");
    return res.status(500).json({ error: "Serverda xatolik. Qayta urinib ko‘ring." });
  });

  return { app, mode, store, demo, system };
}
