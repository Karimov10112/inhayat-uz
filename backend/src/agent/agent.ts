import { randomUUID } from "node:crypto";
import { HttpError } from "../types.js";
import type { AgentMessage, ModelProvider, ToolCall } from "./providers.js";
import { TOOLS, toolByName, type AgentContext } from "./tools.js";

export const SYSTEM_PROMPT = `Sen InHayat platformasining "Nazoratchi" AI agentisan. InHayat — O‘zbekistonda transplantatsiyaga tayyorlanayotgan bemorlarni shifokorlar bilan bog‘laydigan sayt. Sen faqat platforma administratori bilan gaplashasan.

Vazifang: saytni kuzatish, muammolarni topish (javobsiz bemorlar, kutib qolgan arizalar, harakatsiz murojaatlar, texnik sozlamalar), statistikani tushuntirish va administratorga aniq keyingi qadamlarni taklif qilish.

Qoidalar:
- Faqat toollar qaytargan ma’lumotga tayan. Raqam yoki ism to‘qima.
- Sen faqat metama’lumotni ko‘rasan (holat, son, vaqt). Tibbiy hujjat yoki xabar matnini so‘rama va taxmin qilma; tibbiy maslahat berma.
- Ma’lumotni o‘zgartiruvchi amallar (masalan, review_staff_application) administrator "Tasdiqlash" tugmasini bosgandan keyin bajariladi. Bunday amalni taklif qilganingda nima bo‘lishini qisqa tushuntir.
- Shifokorni tasdiqlashni faqat administrator so‘raganda yoki aniq sabab bo‘lganda taklif qil; litsenziyani rasmiy manbada tekshirish kerakligini eslat.
- Administrator qaysi tilda yozsa, o‘sha tilda javob ber (standart: o‘zbek, lotin yozuvi). Qisqa va aniq yoz, ro‘yxatlardan foydalan.`;

const MAX_STEPS = 6;
const PENDING_TTL_MS = 15 * 60_000;

export interface PendingAction { id: string; tool: string; input: Record<string, unknown>; summary: string; adminId: string; createdAt: number }
const pending = new Map<string, PendingAction>();

function prune() {
  const now = Date.now();
  for (const [id, action] of pending) if (now - action.createdAt > PENDING_TTL_MS) pending.delete(id);
}

async function execute(ctx: AgentContext, call: ToolCall): Promise<string> {
  const tool = toolByName(call.name);
  if (!tool) return JSON.stringify({ error: `Noma’lum tool: ${call.name}` });
  try {
    const result = await tool.run(ctx, call.input ?? {});
    const text = JSON.stringify(result);
    await ctx.repo.recordAgentAction(ctx.actor, { tool: call.name, input: JSON.stringify(call.input ?? {}).slice(0, 1000), result: text.slice(0, 1000), approved: !!tool.requiresApproval });
    return text.length > 12000 ? `${text.slice(0, 12000)}…(qisqartirildi)` : text;
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : "Tool xatosi" });
  }
}

/** Sanitises history coming from the browser. */
export function cleanHistory(raw: unknown): AgentMessage[] {
  if (!Array.isArray(raw)) throw new HttpError(400, "messages massiv bo‘lishi kerak.");
  const out: AgentMessage[] = [];
  for (const m of raw.slice(-40)) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: string }).role;
    const content = String((m as { content?: unknown }).content ?? "").slice(0, 16000);
    if (role === "user") out.push({ role, content });
    else if (role === "assistant") {
      const calls = Array.isArray((m as { tool_calls?: unknown }).tool_calls) ? ((m as { tool_calls: ToolCall[] }).tool_calls).filter(c => c && typeof c.id === "string" && typeof c.name === "string").map(c => ({ id: c.id, name: c.name, input: (c.input && typeof c.input === "object") ? c.input : {} })) : undefined;
      out.push({ role, content, ...(calls?.length ? { tool_calls: calls } : {}) });
    } else if (role === "tool") {
      const id = String((m as { tool_call_id?: unknown }).tool_call_id ?? "");
      const name = String((m as { name?: unknown }).name ?? "");
      if (id) out.push({ role, tool_call_id: id, name, content });
    }
  }
  // Drop a leading orphan tool result left over after trimming.
  while (out[0] && out[0].role !== "user") out.shift();
  if (!out.length || out[out.length - 1].role !== "user") throw new HttpError(400, "Oxirgi xabar foydalanuvchidan bo‘lishi kerak.");
  return out;
}

/**
 * Runs the tool loop. Read-only tools run immediately; tools that change data
 * become pending actions that the admin approves with a separate request.
 */
export async function runAgent(ctx: AgentContext, provider: ModelProvider, history: AgentMessage[]) {
  prune();
  const added: AgentMessage[] = [];
  const actions: Omit<PendingAction, "adminId" | "createdAt">[] = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await provider.complete(SYSTEM_PROMPT, [...history, ...added], TOOLS);
    const assistant: AgentMessage = { role: "assistant", content: reply.content, ...(reply.tool_calls.length ? { tool_calls: reply.tool_calls } : {}) };
    added.push(assistant);
    if (!reply.tool_calls.length) break;
    for (const call of reply.tool_calls) {
      const tool = toolByName(call.name);
      if (tool?.requiresApproval) {
        const action: PendingAction = { id: randomUUID(), tool: call.name, input: call.input ?? {}, summary: tool.describe?.(call.input ?? {}) ?? call.name, adminId: ctx.actor.id, createdAt: Date.now() };
        pending.set(action.id, action);
        actions.push({ id: action.id, tool: action.tool, input: action.input, summary: action.summary });
        added.push({ role: "tool", tool_call_id: call.id, name: call.name, content: JSON.stringify({ status: "awaiting_admin_approval", action_id: action.id, note: "Amal hali bajarilmadi. Administrator ekrandagi “Tasdiqlash” tugmasini bosishi kerak." }) });
      } else {
        added.push({ role: "tool", tool_call_id: call.id, name: call.name, content: await execute(ctx, call) });
      }
    }
    if (step === MAX_STEPS - 1) added.push({ role: "assistant", content: "Qadamlar chegarasiga yetdim. Savolni aniqroq qilib qayta yozing." });
  }
  return { messages: added, pendingActions: actions };
}

export async function decideAction(ctx: AgentContext, id: string, approve: boolean) {
  prune();
  const action = pending.get(id);
  if (!action || action.adminId !== ctx.actor.id) throw new HttpError(404, "Amal topilmadi yoki muddati o‘tgan.");
  pending.delete(id);
  if (!approve) {
    await ctx.repo.recordAgentAction(ctx.actor, { tool: action.tool, input: JSON.stringify(action.input).slice(0, 1000), result: "rejected_by_admin", approved: false });
    return { ok: true, executed: false, summary: action.summary };
  }
  const result = await execute(ctx, { id, name: action.tool, input: action.input });
  return { ok: !result.includes("\"error\""), executed: true, summary: action.summary, result: JSON.parse(result) };
}
