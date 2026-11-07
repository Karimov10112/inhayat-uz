"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, LoaderCircle, PauseCircle, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import { api } from "../lib/session";
import { ROLE_LABELS, STAFF_STATUS_LABELS, formatDate } from "../lib/labels";
import type { StaffProfile } from "../lib/types";

export function AdminReviews() {
  const [rows, setRows] = useState<StaffProfile[]>([]);
  const [filter, setFilter] = useState<StaffProfile["status"]>("pending");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try { setRows(await api<StaffProfile[]>("/api/admin/staff")); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Arizalarni o‘qib bo‘lmadi."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function decide(row: StaffProfile, status: StaffProfile["status"]) {
    if (working) return;
    const note = (notes[row.id] || "").trim();
    if ((status === "rejected" || status === "suspended") && !note) { setMessage("Rad etish yoki to‘xtatish sababini yozing — xodim uni ko‘radi."); return; }
    setWorking(row.id); setMessage("");
    try {
      await api(`/api/admin/staff/${row.id}`, { method: "PATCH", body: { status, note } });
      setMessage(`${row.full_name}: ${STAFF_STATUS_LABELS[status]}.`);
      await load();
    } catch (err) { setMessage(err instanceof Error ? err.message : "Saqlanmadi."); }
    finally { setWorking(""); }
  }

  const counts: Record<string, number> = { pending: 0, approved: 0, rejected: 0, suspended: 0 };
  rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const visible = rows.filter(r => r.status === filter && `${r.full_name} ${r.organization} ${r.license_number} ${r.speciality}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));

  return (
    <div className="workspace">
      <header className="page-head">
        <div>
          <small className="eyebrow">Platforma boshqaruvi</small>
          <h1>Xodimlar arizalari</h1>
          <p className="muted">Litsenziya raqamini va ish joyini rasmiy manbada (Sog‘liqni saqlash vazirligi reyestri yoki muassasaning o‘zi orqali) tekshirib, so‘ng tasdiqlang.</p>
        </div>
        <button className="ghost" onClick={() => { setLoading(true); void load(); }}><RefreshCw size={15}/> Yangilash</button>
      </header>
      <div className="stat-row">
        {(["pending", "approved", "rejected", "suspended"] as const).map(s => (
          <button key={s} className={filter === s ? "stat active" : "stat"} onClick={() => setFilter(s)}><b>{counts[s] || 0}</b><span>{STAFF_STATUS_LABELS[s]}</span></button>
        ))}
      </div>
      <label className="search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ism, muassasa yoki litsenziya"/></label>
      {message && <p className="notice" role="status">{message}</p>}
      {loading ? <div className="loading inline"><LoaderCircle className="spin"/> Yuklanmoqda…</div> : visible.length === 0 ? (
        <div className="empty"><b>Bu bo‘limda ariza yo‘q</b></div>
      ) : (
        <div className="review-list">
          {visible.map(row => (
            <article className="card review" key={row.id}>
              <div className="review-main">
                <h3>{row.full_name} <span className={`pill staff-${row.status}`}>{STAFF_STATUS_LABELS[row.status]}</span></h3>
                <dl>
                  <dt>Rol</dt><dd>{ROLE_LABELS[row.role]}{row.speciality ? ` · ${row.speciality}` : ""}</dd>
                  <dt>Muassasa</dt><dd>{row.organization}{row.region ? ` (${row.region})` : ""}</dd>
                  <dt>Litsenziya</dt><dd><code>{row.license_number}</code></dd>
                  <dt>Telefon</dt><dd><a href={`tel:${row.phone}`}>{row.phone}</a></dd>
                  <dt>Ariza sanasi</dt><dd>{formatDate(row.created_at)}</dd>
                  {row.review_note && <><dt>Izoh</dt><dd>{row.review_note}</dd></>}
                </dl>
              </div>
              <div className="review-actions">
                <textarea rows={2} maxLength={500} placeholder="Izoh (rad etish / to‘xtatishda majburiy)" value={notes[row.id] || ""} onChange={e => setNotes({ ...notes, [row.id]: e.target.value })}/>
                <div className="row-actions">
                  {row.status !== "approved" && <button className="primary" disabled={!!working} onClick={() => void decide(row, "approved")}>{working === row.id ? <LoaderCircle size={14} className="spin"/> : <Check size={14}/>} Tasdiqlash</button>}
                  {row.status === "pending" && <button className="danger" disabled={!!working} onClick={() => void decide(row, "rejected")}><X size={14}/> Rad etish</button>}
                  {row.status === "approved" && <button className="danger" disabled={!!working} onClick={() => void decide(row, "suspended")}><PauseCircle size={14}/> To‘xtatish</button>}
                  {(row.status === "rejected" || row.status === "suspended") && <button className="ghost" disabled={!!working} onClick={() => void decide(row, "pending")}><RotateCcw size={14}/> Qayta ko‘rib chiqish</button>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
