import type { Repo } from "../repo/repo.js";
import { CASE_STATUSES, type Actor, type StaffStatus } from "../types.js";
import { scanPlatform } from "./monitor.js";

export interface AgentContext {
  actor: Actor;
  repo: Repo;
  system: { mode: string; storage: string; aiProvider: string; startedAt: number };
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the input object. */
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  /** Changes data -> the admin must press "Tasdiqlash" before it runs. */
  requiresApproval?: boolean;
  /** Short human summary shown on the approval card. */
  describe?: (input: Record<string, unknown>) => string;
  run: (ctx: AgentContext, input: Record<string, unknown>) => Promise<unknown>;
}

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number, min: number, max: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
const STAFF_DECISIONS: StaffStatus[] = ["approved", "rejected", "suspended", "pending"];

/**
 * Tools the AI agent can use. To add your own integration, append an object
 * here (see AGENT.md). Tools receive an admin actor and go through the same
 * Repo as the website, so all permission rules still apply.
 */
export const TOOLS: ToolDefinition[] = [
  {
    name: "get_platform_stats",
    description: "Platformaning umumiy statistikasi: bemorlar, murojaatlar holati bo‘yicha, hujjatlar soni, xodimlar holati, faol ulashishlar, oxirgi 7 kundagi xabarlar.",
    input_schema: { type: "object", properties: {} },
    run: ctx => ctx.repo.platformStats(ctx.actor),
  },
  {
    name: "scan_for_issues",
    description: "Saytni tekshirib, muammolar ro‘yxatini qaytaradi: javobsiz bemorlar, kutib qolgan arizalar, harakatsiz murojaatlar, tizim sozlamalari.",
    input_schema: { type: "object", properties: {} },
    run: async ctx => scanPlatform(await ctx.repo.caseOverview(ctx.actor), await ctx.repo.listStaff(ctx.actor), ctx.system),
  },
  {
    name: "list_cases",
    description: "Murojaatlar (yo‘l xaritalari) ro‘yxati, faqat metama’lumot: bemor ismi, hudud, yo‘nalish, holat, hujjatlar soni, ulashishlar, oxirgi xabar vaqtlari. Xabar matni va fayllar KIRMAYDI.",
    input_schema: { type: "object", properties: {
      status: { type: "string", enum: CASE_STATUSES, description: "Faqat shu holatdagilar" },
      inactive_days: { type: "number", description: "Kamida shuncha kun yangilanmaganlar" },
      limit: { type: "number", description: "Eng ko‘pi bilan (standart 20)" },
    } },
    run: async (ctx, input) => {
      const status = str(input.status);
      const inactive = num(input.inactive_days, 0, 0, 365);
      const cutoff = Date.now() - inactive * 864e5;
      return (await ctx.repo.caseOverview(ctx.actor))
        .filter(c => (!status || c.status === status) && (!inactive || new Date(c.updated_at).getTime() <= cutoff))
        .slice(0, num(input.limit, 20, 1, 100));
    },
  },
  {
    name: "list_staff_applications",
    description: "Shifokor va koordinatorlar arizalari ro‘yxati (ism, rol, mutaxassislik, muassasa, litsenziya, holat, sana).",
    input_schema: { type: "object", properties: { status: { type: "string", enum: STAFF_DECISIONS } } },
    run: async (ctx, input) => (await ctx.repo.listStaff(ctx.actor))
      .filter(s => !input.status || s.status === input.status)
      .map(({ id, full_name, role, speciality, organization, region, license_number, status, review_note, created_at }) => ({ id, full_name, role, speciality, organization, region, license_number, status, review_note, created_at })),
  },
  {
    name: "review_staff_application",
    description: "Xodim arizasi bo‘yicha qaror: approved (tasdiqlash), rejected (rad etish), suspended (to‘xtatish) yoki pending (qayta ko‘rib chiqish). Administrator tasdiqlagandan keyin bajariladi. Rad etish va to‘xtatishda sabab majburiy.",
    input_schema: { type: "object", properties: {
      staff_id: { type: "string" },
      decision: { type: "string", enum: STAFF_DECISIONS },
      note: { type: "string", description: "Xodimga ko‘rinadigan izoh" },
    }, required: ["staff_id", "decision"] },
    requiresApproval: true,
    describe: input => `Xodim ${str(input.staff_id).slice(0, 8)}… → ${str(input.decision)}${input.note ? ` (“${str(input.note).slice(0, 80)}”)` : ""}`,
    run: async (ctx, input) => {
      const decision = str(input.decision) as StaffStatus;
      if (!STAFF_DECISIONS.includes(decision)) throw new Error("Noto‘g‘ri qaror.");
      const note = str(input.note).slice(0, 500);
      if ((decision === "rejected" || decision === "suspended") && !note.trim()) throw new Error("Sabab (note) majburiy.");
      const row = await ctx.repo.reviewStaff(ctx.actor, str(input.staff_id), decision, note);
      return { ok: true, staff: row.full_name, status: row.status };
    },
  },
  {
    name: "recent_activity",
    description: "Saytdagi so‘nggi hodisalar: yangi murojaatlar, yuklangan hujjatlar, xabarlar turi, hujjat ochilishlari, arizalar va qarorlar.",
    input_schema: { type: "object", properties: { limit: { type: "number" } } },
    run: (ctx, input) => ctx.repo.recentActivity(ctx.actor, num(input.limit, 20, 1, 100)),
  },
  {
    name: "system_health",
    description: "Texnik holat: ma’lumotlar rejimi (demo/supabase), fayl ombori (local/r2), AI provayder, ishlash vaqti, xotira.",
    input_schema: { type: "object", properties: {} },
    run: async ctx => ({
      data_mode: ctx.system.mode, file_storage: ctx.system.storage, ai_provider: ctx.system.aiProvider,
      uptime_minutes: Math.round((Date.now() - ctx.system.startedAt) / 60000),
      memory_mb: Math.round(process.memoryUsage().rss / 1048576), node: process.version,
    }),
  },
  {
    name: "agent_action_log",
    description: "AI agent tomonidan bajarilgan amallar jurnali (audit).",
    input_schema: { type: "object", properties: { limit: { type: "number" } } },
    run: (ctx, input) => ctx.repo.listAgentActions(ctx.actor, num(input.limit, 20, 1, 100)),
  },
];

export const toolByName = (name: string) => TOOLS.find(t => t.name === name);
