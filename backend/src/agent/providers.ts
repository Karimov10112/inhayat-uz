import type { ToolDefinition } from "./tools.js";

/** Provider-neutral conversation format (also what the browser keeps). */
export interface ToolCall { id: string; name: string; input: Record<string, unknown> }
export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };

export interface ModelProvider {
  readonly name: string;
  complete(system: string, messages: AgentMessage[], tools: ToolDefinition[]): Promise<{ content: string; tool_calls: ToolCall[] }>;
}

type FetchLike = typeof fetch;
const TIMEOUT_MS = 60_000;

async function postJson(fetchFn: FetchLike, url: string, headers: Record<string, string>, body: unknown) {
  const response = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await response.text();
  if (!response.ok) throw new Error(`AI provayder xatosi (${response.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// ------------------------------------------------------------------ Anthropic
export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic";
  constructor(private apiKey: string, private model: string, private fetchFn: FetchLike = fetch, private baseUrl = "https://api.anthropic.com") {}

  async complete(system: string, messages: AgentMessage[], tools: ToolDefinition[]) {
    // Consecutive tool results become one user turn of tool_result blocks.
    const out: { role: "user" | "assistant"; content: unknown }[] = [];
    for (const m of messages) {
      if (m.role === "user") out.push({ role: "user", content: m.content });
      else if (m.role === "assistant") {
        const blocks: unknown[] = [];
        if (m.content) blocks.push({ type: "text", text: m.content });
        for (const call of m.tool_calls ?? []) blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.input });
        out.push({ role: "assistant", content: blocks.length ? blocks : [{ type: "text", text: "…" }] });
      } else {
        const block = { type: "tool_result", tool_use_id: m.tool_call_id, content: m.content };
        const last = out[out.length - 1];
        if (last?.role === "user" && Array.isArray(last.content)) (last.content as unknown[]).push(block);
        else out.push({ role: "user", content: [block] });
      }
    }
    const data = await postJson(this.fetchFn, `${this.baseUrl}/v1/messages`, { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" }, {
      model: this.model, max_tokens: 1500, system, messages: out,
      tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
    });
    const blocks = (data.content ?? []) as { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[];
    return {
      content: blocks.filter(b => b.type === "text").map(b => b.text).join("\n").trim(),
      tool_calls: blocks.filter(b => b.type === "tool_use").map(b => ({ id: b.id!, name: b.name!, input: b.input ?? {} })),
    };
  }
}

// ------------------------------------------------- OpenAI-compatible (many vendors)
export class OpenAICompatibleProvider implements ModelProvider {
  readonly name = "openai";
  constructor(private apiKey: string, private model: string, private baseUrl = "https://api.openai.com/v1", private fetchFn: FetchLike = fetch) {}

  async complete(system: string, messages: AgentMessage[], tools: ToolDefinition[]) {
    const out = [{ role: "system", content: system }, ...messages.map(m => {
      if (m.role === "tool") return { role: "tool", tool_call_id: m.tool_call_id, content: m.content };
      if (m.role === "assistant") return { role: "assistant", content: m.content || null, ...(m.tool_calls?.length ? { tool_calls: m.tool_calls.map(c => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.input) } })) } : {}) };
      return { role: "user", content: m.content };
    })];
    const data = await postJson(this.fetchFn, `${this.baseUrl.replace(/\/$/, "")}/chat/completions`, { authorization: `Bearer ${this.apiKey}` }, {
      model: this.model, messages: out,
      tools: tools.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })),
    });
    const msg = data.choices?.[0]?.message ?? {};
    return {
      content: (msg.content ?? "").trim(),
      tool_calls: ((msg.tool_calls ?? []) as { id: string; function: { name: string; arguments: string } }[]).map(c => {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(c.function.arguments || "{}"); } catch { /* model sent bad JSON */ }
        return { id: c.id, name: c.function.name, input };
      }),
    };
  }
}

// ------------------------------------------------------------- Offline (no key)
/**
 * Keyword-based fallback so the agent is useful before an API key is added.
 * It only uses read-only tools and formats their results in Uzbek.
 */
export class OfflineProvider implements ModelProvider {
  readonly name = "offline";
  private seq = 0;

  async complete(_system: string, messages: AgentMessage[]) {
    const last = messages[messages.length - 1];
    if (last?.role === "tool") {
      const results = [] as { name: string; content: string }[];
      for (let i = messages.length - 1; i >= 0 && messages[i].role === "tool"; i--) results.unshift(messages[i] as { name: string; content: string });
      return { content: results.map(r => formatResult(r.name, r.content)).join("\n\n"), tool_calls: [] };
    }
    const text = last?.role === "user" ? last.content.toLocaleLowerCase() : "";
    const pick = (name: string, input: Record<string, unknown> = {}) => ({ id: `offline-${++this.seq}`, name, input });
    const calls: ToolCall[] = [];
    if (/(muammo|ogohlan|tekshir|nazorat|scan|issue|проблем|qotib|javobsiz|kutib)/.test(text)) calls.push(pick("scan_for_issues"));
    if (/(statist|necha|qancha|umumiy|stats|сколько|статист|hisobot)/.test(text)) calls.push(pick("get_platform_stats"));
    if (/(ariza|xodim|shifokor|doktor|staff|заявк|врач)/.test(text)) calls.push(pick("list_staff_applications", { status: "pending" }));
    if (/(murojaat|bemor|case|yo‘l xarita|пациент|обращ)/.test(text)) calls.push(pick("list_cases", { limit: 10 }));
    if (/(faoliyat|hodisa|oxirgi|activity|so‘nggi|событ)/.test(text)) calls.push(pick("recent_activity", { limit: 10 }));
    if (/(tizim|server|health|texnik|holat|систем)/.test(text) && !calls.length) calls.push(pick("system_health"));
    if (!calls.length) {
      return { content: "Men oddiy (AI kalitisiz) rejimda ishlayapman. Quyidagilarni so‘rashingiz mumkin:\n• “Muammolarni tekshir”\n• “Umumiy statistika”\n• “Kutayotgan arizalar”\n• “Murojaatlar ro‘yxati”\n• “Oxirgi faoliyat”\n• “Tizim holati”\n\nTo‘liq suhbat uchun backend/.env fayliga ANTHROPIC_API_KEY yoki OPENAI_API_KEY qo‘shing.", tool_calls: [] };
    }
    return { content: "", tool_calls: calls };
  }
}

const STATUS_UZ: Record<string, string> = { draft: "qoralama", documents_pending: "hujjat kutilmoqda", under_review: "ko‘rib chiqilmoqda", centre_contacted: "markaz bilan bog‘lanildi", closed: "yopilgan", pending: "tekshiruvda", approved: "tasdiqlangan", rejected: "rad etilgan", suspended: "to‘xtatilgan" };

function formatResult(name: string, raw: string): string {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return raw; }
  if (data && typeof data === "object" && "error" in (data as object)) return `⚠️ ${(data as { error: string }).error}`;
  switch (name) {
    case "scan_for_issues": {
      const alerts = data as { level: string; title: string; detail: string; suggestion: string }[];
      if (!alerts.length) return "✅ Muammo topilmadi.";
      const icon: Record<string, string> = { critical: "🔴", warning: "🟠", info: "🔵" };
      return `**Tekshiruv natijasi — ${alerts.length} ta band:**\n` + alerts.map(a => `${icon[a.level] ?? "•"} **${a.title}.** ${a.detail} _Taklif: ${a.suggestion}_`).join("\n");
    }
    case "get_platform_stats": {
      const s = data as { patients: number; cases: number; documents: number; active_shares: number; notes_last_7_days: number; cases_by_status: Record<string, number>; staff_by_status: Record<string, number> };
      const fmt = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${STATUS_UZ[k] ?? k}: ${v}`).join(", ") || "—";
      return `**Umumiy statistika:**\n• Bemorlar: ${s.patients}\n• Murojaatlar: ${s.cases} (${fmt(s.cases_by_status)})\n• Hujjatlar: ${s.documents}\n• Xodimlar: ${fmt(s.staff_by_status)}\n• Faol ulashishlar: ${s.active_shares}\n• Oxirgi 7 kundagi xabarlar: ${s.notes_last_7_days}`;
    }
    case "list_staff_applications": {
      const rows = data as { full_name: string; organization: string; license_number: string; status: string }[];
      return rows.length ? `**Tekshiruvdagi arizalar (${rows.length}):**\n` + rows.map(r => `• ${r.full_name} — ${r.organization}, litsenziya ${r.license_number}`).join("\n") + "\n\nTasdiqlash uchun “Xodimlar arizalari” bo‘limiga o‘ting." : "Tekshiruvni kutayotgan ariza yo‘q.";
    }
    case "list_cases": {
      const rows = data as { patient_name: string; region: string; status: string; documents: number; active_shares: number }[];
      return rows.length ? `**Murojaatlar (${rows.length}):**\n` + rows.map(r => `• ${r.patient_name} (${r.region}) — ${STATUS_UZ[r.status] ?? r.status}, hujjat: ${r.documents}, shifokorlar: ${r.active_shares}`).join("\n") : "Murojaat yo‘q.";
    }
    case "recent_activity": {
      const rows = data as { at: string; actor: string; detail: string }[];
      return `**So‘nggi faoliyat:**\n` + rows.map(r => `• ${new Date(r.at).toLocaleString("uz-UZ")} — ${r.actor}: ${r.detail}`).join("\n");
    }
    case "system_health": {
      const h = data as Record<string, unknown>;
      return `**Tizim holati:** ma’lumotlar — ${h.data_mode}, fayllar — ${h.file_storage}, AI — ${h.ai_provider}, ishlash vaqti — ${h.uptime_minutes} daqiqa, xotira — ${h.memory_mb} MB.`;
    }
    default:
      return "```json\n" + JSON.stringify(data, null, 2).slice(0, 2000) + "\n```";
  }
}

/** Picks a provider from environment variables. */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env, fetchFn: FetchLike = fetch): ModelProvider {
  const choice = (env.AI_PROVIDER || "").toLowerCase();
  if ((choice === "anthropic" || !choice) && env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL || "claude-sonnet-5-5", fetchFn);
  }
  if ((choice === "openai" || !choice) && env.OPENAI_API_KEY) {
    return new OpenAICompatibleProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL || "gpt-4o-mini", env.OPENAI_BASE_URL || "https://api.openai.com/v1", fetchFn);
  }
  return new OfflineProvider();
}
