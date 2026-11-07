"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Circle, ExternalLink, FileText, Inbox, LoaderCircle, MapPin, Phone, RefreshCw, Search, Send } from "lucide-react";
import { api, openDocument } from "../lib/api";
import { CHECKLIST_LABELS, DOC_KIND_LABELS, PATHWAY_LABELS, STATUS_LABELS, STATUS_ORDER, formatDate } from "../lib/labels";
import type { CaseBundle, SharedCaseRow, StaffProfile } from "../lib/types";

const waiting = (r: SharedCaseRow) => !!r.last_patient_message_at && (!r.last_staff_message_at || r.last_staff_message_at < r.last_patient_message_at);
const hoursSince = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 36e5 : 0);

export function DoctorWorkspace({ staff }: { staff: StaffProfile }) {
  const [rows, setRows] = useState<SharedCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState("");

  const load = useCallback(async () => {
    setError("");
    try { setRows(await api<SharedCaseRow[]>("/api/staff/cases")); }
    catch (err) { setError(err instanceof Error ? err.message : "Bemorlar ro‘yxatini yuklab bo‘lmadi."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Patients waiting for a reply first, then most recently shared.
  const sorted = useMemo(() => [...rows].sort((a, b) => Number(waiting(b)) - Number(waiting(a)) || b.shared_at.localeCompare(a.shared_at)), [rows]);
  const filtered = sorted.filter(r =>
    (!filter || (filter === "waiting" ? waiting(r) : r.case.status === filter)) &&
    `${r.patient.full_name} ${r.patient.phone} ${r.case.preferred_region}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const count = (status: string) => rows.filter(r => r.case.status === status).length;
  const current = rows.find(r => r.case.id === selected);

  if (current) return <CaseDetail key={current.case.id} row={current} staff={staff} onBack={() => { setSelected(""); void load(); }}/>;

  return (
    <div className="workspace">
      <header className="page-head">
        <div>
          <small className="eyebrow">Shaxsiy ish stoli</small>
          <h1>Bemorlarim</h1>
          <p className="muted">Sizga ruxsat bergan bemorlar. Javob kutayotganlar yuqorida. Bemor ruxsatni bekor qilsa, u ro‘yxatdan darhol yo‘qoladi.</p>
        </div>
        <button className="ghost" onClick={() => { setLoading(true); void load(); }}><RefreshCw size={15}/> Yangilash</button>
      </header>

      <div className="stat-row">
        <button className={!filter ? "stat active" : "stat"} onClick={() => setFilter("")}><b>{rows.length}</b><span>Barchasi</span></button>
        <button className={filter === "waiting" ? "stat active warn" : "stat warn"} onClick={() => setFilter(filter === "waiting" ? "" : "waiting")}><b>{rows.filter(waiting).length}</b><span>Javob kutmoqda</span></button>
        {["documents_pending", "under_review", "centre_contacted"].map(s => (
          <button key={s} className={filter === s ? "stat active" : "stat"} onClick={() => setFilter(filter === s ? "" : s)}><b>{count(s)}</b><span>{STATUS_LABELS[s]}</span></button>
        ))}
      </div>

      <label className="search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ism, telefon yoki hudud bo‘yicha qidirish"/></label>
      {error && <p className="error">{error}</p>}

      {loading ? <div className="loading inline"><LoaderCircle className="spin"/> Yuklanmoqda…</div> : filtered.length === 0 ? (
        <div className="empty"><Inbox size={30}/><b>{rows.length ? "Mos bemor topilmadi" : "Hozircha bemor yo‘q"}</b><span>{rows.length ? "Filtrni o‘zgartiring." : "Bemor o‘z kabinetida sizni tanlab ruxsat berganda shu yerda paydo bo‘ladi."}</span></div>
      ) : (
        <table className="table">
          <thead><tr><th>Bemor</th><th>Yo‘nalish</th><th>Hudud</th><th>Hujjat</th><th>Holat</th><th>Ulashilgan</th></tr></thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.case.id} onClick={() => setSelected(r.case.id)} tabIndex={0} onKeyDown={e => { if (e.key === "Enter") setSelected(r.case.id); }} className={waiting(r) ? "row-waiting" : ""}>
                <td><b>{r.patient.full_name || "Ism ko‘rsatilmagan"}</b><small>{r.patient.phone}</small>
                  {waiting(r) && <span className="waiting-tag"><AlertCircle size={12}/> Javob kutmoqda · {Math.max(1, Math.round(hoursSince(r.last_patient_message_at)))} soat</span>}</td>
                <td>{PATHWAY_LABELS[r.case.transplant_pathway] || r.case.transplant_pathway}</td>
                <td>{r.case.preferred_region || "—"}</td>
                <td>{r.documents}</td>
                <td><span className={`pill status-${r.case.status}`}>{STATUS_LABELS[r.case.status] || r.case.status}</span></td>
                <td>{formatDate(r.shared_at, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const TEMPLATES: Record<string, string[]> = {
  document_request: [
    "Iltimos, oxirgi 1 oydagi kreatinin, mochevina va umumiy qon tahlili natijalarini yuklang.",
    "Iltimos, buyrak/jigar UZI xulosasini yuklang.",
    "HLA tiplash natijasi kerak bo‘ladi. Topshirish joyini koordinator bilan kelishing.",
  ],
  conclusion: [
    "Yuklangan tahlillar dastlabki ko‘rik uchun yetarli. Keyingi qadam — markazda yuzma-yuz konsultatsiya.",
    "Hozircha transplantatsiya bosqichiga o‘tish uchun qo‘shimcha tekshiruvlar talab etiladi (quyida sanab o‘tilgan).",
  ],
  message: ["Xabaringizni oldim, 1–2 ish kuni ichida javob beraman."],
};

function CaseDetail({ row, staff, onBack }: { row: SharedCaseRow; staff: StaffProfile; onBack: () => void }) {
  const [bundle, setBundle] = useState<CaseBundle | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"message" | "document_request" | "conclusion">("message");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try { setBundle(await api<CaseBundle>(`/api/cases/${row.case.id}`)); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Yuklanmadi."); }
  }, [row.case.id]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function changeStatus(next: string) {
    if (!bundle || next === bundle.case.status || savingStatus) return;
    setSavingStatus(true); setMessage("");
    try { await api(`/api/cases/${row.case.id}/status`, { body: { status: next } }); setMessage("Holat yangilandi — bemor kabinetida ko‘rinadi."); await load(); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Holat o‘zgarmadi."); }
    finally { setSavingStatus(false); }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (sending || !text.trim()) return;
    setSending(true); setMessage("");
    try {
      await api(`/api/cases/${row.case.id}/notes`, { body: { kind, body: text.trim().slice(0, 4000) } });
      setText(""); setKind("message");
      await load();
    } catch (err) { setMessage(err instanceof Error ? err.message : "Yuborilmadi."); }
    finally { setSending(false); }
  }

  async function view(id: string) {
    setMessage("");
    try { await openDocument(id); } catch (err) { setMessage(err instanceof Error ? err.message : "Hujjat ochilmadi."); }
  }

  const kindLabel: Record<string, string> = { document_request: "Hujjat so‘rovi", conclusion: "Xulosa", status: "Holat o‘zgardi" };
  const patient = bundle?.patient ?? row.patient;
  const status = bundle?.case.status ?? row.case.status;

  return (
    <div className="workspace">
      <button className="ghost back" onClick={onBack}><ArrowLeft size={15}/> Bemorlar ro‘yxati</button>
      <header className="page-head patient-head">
        <div>
          <small className="eyebrow">{PATHWAY_LABELS[row.case.transplant_pathway] || row.case.transplant_pathway}</small>
          <h1>{patient.full_name || "Ism ko‘rsatilmagan"}</h1>
          <p className="meta">
            {patient.phone && <a href={`tel:${patient.phone}`}><Phone size={14}/> {patient.phone}</a>}
            <span><MapPin size={14}/> {row.case.preferred_region || "—"}</span>
            <span>Yo‘l xaritasi: {formatDate(row.case.created_at, false)}</span>
          </p>
        </div>
        <label className="status-select">Holat
          <select value={status} onChange={e => void changeStatus(e.target.value)} disabled={savingStatus || !bundle}>
            {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>
      </header>
      {message && <p className="notice" role="status">{message}</p>}
      {!bundle ? <div className="loading inline"><LoaderCircle className="spin"/> Yuklanmoqda…</div> : (
        <>
          <div className="detail-grid">
            <section className="card">
              <h2><FileText size={17}/> Hujjatlar <small>({bundle.documents.length})</small></h2>
              {bundle.documents.length === 0 ? <p className="muted">Bemor hali hujjat yuklamagan. Pastdagi “Hujjat so‘rovi” orqali kerakli tahlillarni so‘rang.</p> : (
                <ul className="docs">
                  {bundle.documents.map(doc => (
                    <li key={doc.id}>
                      <div><b>{doc.original_name}</b><small>{DOC_KIND_LABELS[doc.kind] || doc.kind} · {doc.bytes >= 1048576 ? `${(doc.bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(doc.bytes / 1024))} KB`} · {formatDate(doc.uploaded_at, false)}</small></div>
                      <button className="ghost" onClick={() => void view(doc.id)}><ExternalLink size={14}/> Ochish</button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted tiny">Har bir ochilish bemorga “kim ko‘rgan” ro‘yxatida ko‘rsatiladi.</p>
            </section>

            <section className="card">
              <h2>Tayyorgarlik ro‘yxati <small>({bundle.checklist.length}/5)</small></h2>
              <ul className="checklist">
                {Object.entries(CHECKLIST_LABELS).map(([key, label]) => (
                  <li key={key} className={bundle.checklist.includes(key) ? "done" : ""}>{bundle.checklist.includes(key) ? <CheckCircle2 size={16}/> : <Circle size={16}/>} {label}</li>
                ))}
              </ul>
              <p className="muted tiny">Bemor o‘zi belgilaydi; bu klinik baho emas.</p>
            </section>
          </div>

          <section className="card thread-card">
            <h2>Bemor bilan yozishma</h2>
            <div className="thread">
              {bundle.notes.length === 0 && <p className="muted">Hali xabar yo‘q.</p>}
              {bundle.notes.map(note => (
                <article key={note.id} className={`note ${note.author_is_staff ? "staff" : "patient"} kind-${note.kind}`}>
                  <header>
                    <b>{note.author_id === staff.id ? "Siz" : note.author_is_staff ? note.author_name : `${patient.full_name || "Bemor"} (bemor)`}</b>
                    {kindLabel[note.kind] && <span className="note-kind">{kindLabel[note.kind]}</span>}
                    <time>{formatDate(note.created_at)}</time>
                  </header>
                  <p>{note.kind === "status" ? STATUS_LABELS[note.body] || note.body : note.body}</p>
                </article>
              ))}
            </div>
            <form className="composer" onSubmit={send}>
              <div className="kind-switch" role="radiogroup" aria-label="Xabar turi">
                {([["message", "Xabar"], ["document_request", "Hujjat so‘rovi"], ["conclusion", "Xulosa"]] as const).map(([value, label]) => (
                  <button type="button" key={value} role="radio" aria-checked={kind === value} className={kind === value ? "selected" : ""} onClick={() => setKind(value)}>{label}</button>
                ))}
              </div>
              <div className="templates">
                {TEMPLATES[kind].map(t => <button type="button" key={t} onClick={() => setText(t)}>{t.length > 60 ? `${t.slice(0, 58)}…` : t}</button>)}
              </div>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={4000}
                placeholder={kind === "document_request" ? "Qaysi tahlil yoki hujjat kerak?" : kind === "conclusion" ? "Dastlabki xulosa va keyingi qadamlar…" : "Bemorga xabar…"}/>
              <button className="primary" disabled={sending || !text.trim()}>{sending ? <LoaderCircle size={15} className="spin"/> : <Send size={15}/>} Yuborish</button>
            </form>
            <p className="muted tiny">Bemor barcha xabar va xulosalarni o‘z kabinetida ko‘radi. “Hujjat so‘rovi” holatni avtomatik “Hujjatlar kutilmoqda”ga o‘tkazadi. Xulosa onlayn maslahat; yakuniy klinik qaror qabulda qilinadi.</p>
          </section>
        </>
      )}
    </div>
  );
}
