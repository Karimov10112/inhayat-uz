import type { ToolDefinition } from "./tools.js";

export interface ToolCall { id: string; name: string; input: Record<string, unknown> }
export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };

export interface ModelProvider {
  readonly name: string;
  complete(system: string, messages: AgentMessage[], tools: ToolDefinition[]): Promise<{ content: string; tool_calls: ToolCall[] }>;
}

/**
 * Local-only provider used for handoff builds. It never sends platform data
 * outside the backend and only invokes the existing read-only tools.
 */
export class OfflineProvider implements ModelProvider {
  readonly name = "offline";
  private seq = 0;

  async complete(_system: string, messages: AgentMessage[]) {
    const last = messages[messages.length - 1];
    if (last?.role === "tool") {
      const results: { name: string; content: string }[] = [];
      for (let i = messages.length - 1; i >= 0 && messages[i].role === "tool"; i--) {
        const message = messages[i] as Extract<AgentMessage, { role: "tool" }>;
        results.unshift({ name: message.name, content: message.content });
      }
      return {
        content: results.map(result => formatToolResult(result.name, result.content)).join("\n\n"),
        tool_calls: [],
      };
    }

    const text = last?.role === "user" ? last.content.toLocaleLowerCase() : "";
    const pick = (name: string, input: Record<string, unknown> = {}) => ({ id: `offline-${++this.seq}`, name, input });
    const calls: ToolCall[] = [];
    if (/(muammo|ogohlan|tekshir|nazorat|scan|issue|qotib|javobsiz|kutib)/.test(text)) calls.push(pick("scan_for_issues"));
    if (/(statist|necha|qancha|umumiy|stats|hisobot)/.test(text)) calls.push(pick("get_platform_stats"));
    if (/(ariza|xodim|shifokor|doktor|staff|zayav)/.test(text)) calls.push(pick("list_staff_applications", { status: "pending" }));
    if (/(murojaat|bemor|case|yo‘l xarita|patient)/.test(text)) calls.push(pick("list_cases", { limit: 10 }));
    if (/(faoliyat|hodisa|oxirgi|activity|so‘nggi)/.test(text)) calls.push(pick("recent_activity", { limit: 10 }));
    if (/(tizim|server|health|texnik|holat|sistem)/.test(text) && !calls.length) calls.push(pick("system_health"));
    if (!calls.length) {
      return {
        content: "Men lokal, tashqi API'siz rejimda ishlayapman. “Muammolarni tekshir”, “Umumiy statistika”, “Murojaatlar ro‘yxati” yoki “Tizim holati” deb so‘rashingiz mumkin.",
        tool_calls: [],
      };
    }
    return { content: "", tool_calls: calls };
  }
}

const STATUS: Record<string, string> = {
  draft: "Qoralama", documents_pending: "Hujjatlar kutilmoqda", under_review: "Ko‘rib chiqilmoqda",
  centre_contacted: "Markaz bilan bog‘lanildi", closed: "Yopilgan",
};
const STAFF_STATUS: Record<string, string> = { pending: "Tekshiruvda", approved: "Tasdiqlangan", rejected: "Rad etilgan", suspended: "To‘xtatilgan" };
const PATHWAY: Record<string, string> = { kidney: "Buyrak", liver: "Jigar", heart: "Yurak", stem_cell: "Ildiz hujayra", other: "Boshqa" };
const LEVEL: Record<string, string> = { critical: "🔴 Jiddiy", warning: "🟠 Ogohlantirish", info: "🔵 Ma’lumot" };
const date = (iso: unknown) => (typeof iso === "string" && iso ? iso.slice(0, 16).replace("T", " ") : "—");
type Row = Record<string, unknown>;

/** Turns raw tool JSON into short, readable Uzbek text for the admin console. */
export function formatToolResult(name: string, raw: string): string {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return raw; }
  if (data && typeof data === "object" && "error" in (data as Row)) return `⚠️ Xato: ${String((data as Row).error)}`;
  const rows = Array.isArray(data) ? (data as Row[]) : [];
  switch (name) {
    case "scan_for_issues": {
      if (!rows.length) return "**Tekshiruv natijasi:** muammo topilmadi. ✅";
      const order = ["critical", "warning", "info"];
      const sorted = [...rows].sort((a, b) => order.indexOf(String(a.level)) - order.indexOf(String(b.level)));
      return [`**Tekshiruv natijasi:** ${rows.length} ta topilma`, ...sorted.map(a =>
        `• ${LEVEL[String(a.level)] ?? a.level} — **${a.title}**. ${a.detail}${a.suggestion ? ` Tavsiya: ${a.suggestion}` : ""}`)].join("\n");
    }
    case "get_platform_stats": {
      const st = data as Row;
      const byStatus = Object.entries((st.cases_by_status as Record<string, number>) ?? {}).map(([k, v]) => `${STATUS[k] ?? k}: ${v}`).join(", ") || "—";
      const staff = Object.entries((st.staff_by_status as Record<string, number>) ?? {}).map(([k, v]) => `${STAFF_STATUS[k] ?? k}: ${v}`).join(", ") || "—";
      return ["**Umumiy statistika**", `• Bemorlar: **${st.patients ?? 0}**`, `• Murojaatlar: **${st.cases ?? 0}** (${byStatus})`,
        `• Hujjatlar: **${st.documents ?? 0}**`, `• Xodimlar: ${staff}`, `• Faol ulashishlar: **${st.active_shares ?? 0}**`,
        `• Oxirgi 7 kundagi xabarlar: **${st.notes_last_7_days ?? 0}**`].join("\n");
    }
    case "list_staff_applications":
      if (!rows.length) return "**Xodim arizalari:** kutilayotgan ariza yo‘q. ✅";
      return [`**Xodim arizalari** (${rows.length})`, ...rows.map(r =>
        `• **${r.full_name}** — ${r.role ?? ""}${r.organization ? `, ${r.organization}` : ""}${r.region ? ` (${r.region})` : ""}. Litsenziya: \`${r.license_number ?? "—"}\`. Holat: ${STAFF_STATUS[String(r.status)] ?? r.status}, ${date(r.created_at)}`)].join("\n");
    case "list_cases":
      if (!rows.length) return "**Murojaatlar:** mos murojaat topilmadi.";
      return [`**Murojaatlar** (${rows.length})`, ...rows.map(c =>
        `• **${c.patient_name || "Ismsiz bemor"}** — ${PATHWAY[String(c.pathway)] ?? c.pathway}, ${c.region || "—"}. Holat: ${STATUS[String(c.status)] ?? c.status}. Hujjatlar: ${c.documents ?? 0}, shifokorlar: ${c.active_shares ?? 0}. Yangilangan: ${date(c.updated_at)}`)].join("\n");
    case "recent_activity":
      if (!rows.length) return "**So‘nggi faoliyat:** hodisalar yo‘q.";
      return [`**So‘nggi faoliyat** (${rows.length})`, ...rows.map(e => `• ${date(e.at)} — **${e.actor || "Tizim"}**: ${e.detail}`)].join("\n");
    case "system_health": {
      const h = data as Row;
      return ["**Tizim holati**", `• Ma’lumotlar rejimi: ${h.data_mode}`, `• Fayl ombori: ${h.file_storage}`, `• AI provayder: ${h.ai_provider}`,
        `• Ishlash vaqti: ${h.uptime_minutes} daqiqa`, `• Xotira: ${h.memory_mb} MB`, `• Node: ${h.node}`].join("\n");
    }
    case "agent_action_log":
      if (!rows.length) return "**Agent jurnali:** hali amal bajarilmagan.";
      return [`**Agent jurnali** (${rows.length})`, ...rows.map(a => `• ${date(a.at)} — \`${a.tool}\` ${a.approved ? "✅" : "✖️"} ${a.result ?? ""}`)].join("\n");
    default:
      return "```json\n" + JSON.stringify(data, null, 2) + "\n```";
  }
}
