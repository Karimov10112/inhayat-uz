"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Bot, Check, LoaderCircle, Send, Sparkles, Trash2, User, Wrench, X } from "lucide-react";
import { api } from "../lib/session";

type ToolCall = { id: string; name: string; input: Record<string, unknown> };
type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };
type PendingAction = { id: string; tool: string; input: Record<string, unknown>; summary: string; state?: "approved" | "rejected" | "failed"; result?: string };

const STORAGE_KEY = "inhayat_agent_chat";
const SUGGESTIONS = [
  "Saytdagi muammolarni tekshir",
  "Umumiy statistikani ko‘rsat",
  "Kutayotgan xodim arizalari bormi?",
  "3 kundan ko‘p javobsiz qolgan bemorlar",
  "Oxirgi faoliyat",
  "Tizim holati",
];

const TOOL_LABELS: Record<string, string> = {
  get_platform_stats: "Statistika", scan_for_issues: "Saytni tekshirish", list_cases: "Murojaatlar", list_staff_applications: "Arizalar",
  review_staff_application: "Ariza bo‘yicha qaror", recent_activity: "Faoliyat", system_health: "Tizim holati", agent_action_log: "Audit jurnali",
};

/** Minimal, safe markdown: **bold**, _italic_, `code`, ``` blocks, "• / -" bullets. */
function renderText(text: string): ReactNode {
  const blocks = text.split(/```(?:json)?\n?/);
  return blocks.map((block, i) => i % 2 === 1
    ? <pre key={i}>{block.trim()}</pre>
    : <Fragment key={i}>{block.split("\n").map((line, j) => {
        const bullet = /^\s*[•\-*]\s+/.test(line);
        const body = line.replace(/^\s*[•\-*]\s+/, "");
        // _italic_ only when the underscores are not inside a word (keeps ANTHROPIC_API_KEY intact).
        const parts = body.split(/(\*\*[^*]+\*\*|(?<!\w)_.+?_(?!\w)|`[^`]+`)/g).map((p, k) =>
          p.startsWith("**") ? <b key={k}>{p.slice(2, -2)}</b> : p.startsWith("_") && p.endsWith("_") && p.length > 2 ? <i key={k}>{p.slice(1, -1)}</i> : p.startsWith("`") && p.endsWith("`") && p.length > 1 ? <code key={k}>{p.slice(1, -1)}</code> : p);
        return line.trim() ? <p key={j} className={bullet ? "bullet" : ""}>{parts}</p> : <br key={j}/>;
      })}</Fragment>);
}

export function AgentConsole() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.messages) { setMessages(saved.messages); setActions(saved.actions ?? []); }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, actions })); } catch { /* ignore */ }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, actions]);

  async function ask(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setError(""); setInput("");
    const history: AgentMessage[] = [...messages, { role: "user", content }];
    setMessages(history);
    setBusy(true);
    try {
      const r = await api<{ messages: AgentMessage[]; pendingActions: PendingAction[] }>("/api/agent/chat", { body: { messages: history } });
      setMessages([...history, ...r.messages]);
      if (r.pendingActions.length) setActions(a => [...a, ...r.pendingActions]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent javob bermadi.");
    } finally { setBusy(false); }
  }

  async function decide(action: PendingAction, approve: boolean) {
    setBusy(true); setError("");
    try {
      const r = await api<{ executed: boolean; ok: boolean; result?: unknown }>(`/api/agent/actions/${action.id}`, { body: { approve } });
      const state = !approve ? "rejected" : r.ok ? "approved" : "failed";
      setActions(list => list.map(a => a.id === action.id ? { ...a, state, result: r.result ? JSON.stringify(r.result) : undefined } : a));
      // Tell the agent what happened so the conversation stays consistent.
      setMessages(m => [...m, { role: "user", content: `[Tizim] “${action.summary}” amali ${state === "approved" ? "administrator tomonidan tasdiqlandi va bajarildi" : state === "rejected" ? "administrator tomonidan bekor qilindi" : "bajarilmadi (xato)"}.` }, { role: "assistant", content: state === "approved" ? "Amal bajarildi. ✅" : state === "rejected" ? "Tushunarli, amal bekor qilindi." : "Amal bajarilmadi. Ma’lumotlarni tekshiring." }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik");
    } finally { setBusy(false); }
  }

  function clear() { setMessages([]); setActions([]); setError(""); }
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(input); };
  const visible = messages.filter(m => m.role !== "tool" && !(m.role === "assistant" && !m.content && !m.tool_calls?.length));
  const open = actions.filter(a => !a.state);

  return (
    <div className="workspace agent">
      <header className="page-head">
        <div>
          <small className="eyebrow">AI agent</small>
          <h1>Nazoratchi</h1>
          <p className="muted">Saytni kuzatadi, muammolarni topadi va keyingi qadamlarni taklif qiladi. Ma’lumotni o‘zgartiradigan har qanday amal faqat siz “Tasdiqlash”ni bosgandan keyin bajariladi.</p>
        </div>
        {messages.length > 0 && <button className="ghost" onClick={clear}><Trash2 size={15}/> Suhbatni tozalash</button>}
      </header>

      <section className="card chat">
        <div className="chat-log" aria-live="polite">
          {visible.length === 0 && (
            <div className="chat-empty">
              <span className="bot-hero"><Sparkles size={26}/></span>
              <b>Nimani tekshiray?</b>
              <div className="suggestions">{SUGGESTIONS.map(s => <button key={s} onClick={() => void ask(s)} disabled={busy}>{s}</button>)}</div>
            </div>
          )}
          {visible.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <span className="msg-avatar">{m.role === "user" ? <User size={15}/> : <Bot size={15}/>}</span>
              <div className="msg-body">
                {m.role === "assistant" && m.tool_calls?.length ? (
                  <div className="tool-chips">{m.tool_calls.map(c => <span key={c.id}><Wrench size={11}/> {TOOL_LABELS[c.name] || c.name}</span>)}</div>
                ) : null}
                {m.content && <div className="msg-text">{renderText(m.content)}</div>}
              </div>
            </div>
          ))}
          {busy && <div className="msg assistant"><span className="msg-avatar"><Bot size={15}/></span><div className="msg-body typing"><LoaderCircle size={15} className="spin"/> O‘ylayapman…</div></div>}
          {open.map(a => (
            <div key={a.id} className="approval">
              <b>Tasdiq kerak</b>
              <p>{a.summary}</p>
              <div className="row-actions tight">
                <button className="primary" disabled={busy} onClick={() => void decide(a, true)}><Check size={14}/> Tasdiqlash</button>
                <button className="danger" disabled={busy} onClick={() => void decide(a, false)}><X size={14}/> Bekor qilish</button>
              </div>
            </div>
          ))}
          <div ref={endRef}/>
        </div>
        {error && <p className="error">{error}</p>}
        <form className="chat-input" onSubmit={submit}>
          <textarea value={input} onChange={e => setInput(e.target.value)} rows={2} maxLength={2000} placeholder="Masalan: “Qaysi bemorlar 2 kundan ko‘p javob kutmoqda?”"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(input); } }}/>
          <button className="primary" disabled={busy || !input.trim()}><Send size={15}/> Yuborish</button>
        </form>
      </section>
    </div>
  );
}
