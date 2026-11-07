"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bot, FileText, Info, LoaderCircle, MessageSquareText, RefreshCw, RotateCcw, Search, ShieldAlert, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { api } from "../lib/session";
import { PATHWAY_LABELS, STATUS_LABELS, STATUS_ORDER, formatDate } from "../lib/labels";
import type { Alert, Dashboard } from "../lib/types";

const LEVEL_ICON = { critical: <ShieldAlert size={16}/>, warning: <AlertTriangle size={16}/>, info: <Info size={16}/> };
const LEVEL_LABEL = { critical: "Jiddiy", warning: "Diqqat", info: "Ma’lumot" };

export function AdminDashboard({ demo, onOpenAgent, onOpenReviews }: { demo: boolean; onOpenAgent: () => void; onOpenReviews: () => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try { setData(await api<Dashboard>("/api/admin/dashboard")); }
    catch (err) { setError(err instanceof Error ? err.message : "Yuklanmadi."); }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  const cases = useMemo(() => (data?.cases ?? []).filter(c => (!status || c.status === status) && `${c.patient_name} ${c.region}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [data, status, query]);

  async function resetDemo() {
    if (!window.confirm("Demo ma’lumotlar boshlang‘ich holatga qaytarilsinmi? Siz qo‘shgan barcha demo yozuvlar o‘chadi.")) return;
    setResetting(true);
    try { await api("/api/admin/demo/reset", { body: {} }); window.location.reload(); }
    catch (err) { setError(err instanceof Error ? err.message : "Xatolik"); setResetting(false); }
  }

  if (error && !data) return <div className="workspace"><p className="error">{error}</p></div>;
  if (!data) return <div className="loading inline"><LoaderCircle className="spin"/> Yuklanmoqda…</div>;
  const s = data.stats;
  const pendingStaff = s.staff_by_status.pending || 0;
  const totalCases = Math.max(1, s.cases);

  return (
    <div className="workspace">
      <header className="page-head">
        <div>
          <small className="eyebrow">Platforma boshqaruvi</small>
          <h1>Boshqaruv paneli</h1>
          <p className="muted">Faqat metama’lumot: holatlar, sonlar va vaqtlar. Tibbiy hujjat va xabar matnlari bu yerda ko‘rinmaydi.</p>
        </div>
        <div className="row-actions tight">
          <button className="ghost" onClick={() => void load()}><RefreshCw size={15}/> Yangilash</button>
          <button className="primary" onClick={onOpenAgent}><Bot size={15}/> AI Nazoratchi</button>
        </div>
      </header>

      <div className="kpi-row">
        <Kpi icon={<Users size={18}/>} value={s.patients} label="Bemorlar"/>
        <Kpi icon={<Activity size={18}/>} value={s.cases} label="Murojaatlar"/>
        <Kpi icon={<FileText size={18}/>} value={s.documents} label="Hujjatlar"/>
        <Kpi icon={<Stethoscope size={18}/>} value={s.staff_by_status.approved || 0} label="Faol shifokorlar"/>
        <Kpi icon={<MessageSquareText size={18}/>} value={s.notes_last_7_days} label="Xabarlar (7 kun)"/>
        <Kpi icon={<ShieldCheck size={18}/>} value={pendingStaff} label="Kutayotgan arizalar" warn={pendingStaff > 0} onClick={onOpenReviews}/>
      </div>

      <section className="card status-card">
        <h2>Murojaatlar holati</h2>
        <div className="status-bar" role="img" aria-label="Murojaatlar holat bo‘yicha">
          {STATUS_ORDER.map(st => (s.cases_by_status[st] ? <span key={st} className={`seg status-${st}`} style={{ width: `${(s.cases_by_status[st] / totalCases) * 100}%` }} title={`${STATUS_LABELS[st]}: ${s.cases_by_status[st]}`}/> : null))}
        </div>
        <div className="legend">
          {STATUS_ORDER.map(st => <span key={st}><i className={`dot status-${st}`}/>{STATUS_LABELS[st]} <b>{s.cases_by_status[st] || 0}</b></span>)}
        </div>
      </section>

      <div className="dash-grid">
        <section className="card">
          <h2><ShieldAlert size={17}/> Ogohlantirishlar <small>({data.alerts.length})</small></h2>
          {data.alerts.length === 0 ? <p className="muted">Muammo topilmadi. ✅</p> : (
            <ul className="alerts">
              {data.alerts.map((a: Alert) => (
                <li key={a.id} className={`alert ${a.level}`}>
                  <span className="alert-icon">{LEVEL_ICON[a.level]}</span>
                  <div>
                    <b>{a.title} <em>{LEVEL_LABEL[a.level]}</em></b>
                    <p>{a.detail}</p>
                    <small>{a.suggestion}</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="muted tiny">Ogohlantirishlarni qoidalar asosidagi monitor topadi (AI kalitisiz ham ishlaydi). Batafsil tahlil uchun AI Nazoratchidan so‘rang.</p>
        </section>
        <section className="card">
          <h2><Activity size={17}/> So‘nggi faoliyat</h2>
          <ul className="feed">
            {data.activity.map((e, i) => (
              <li key={i}><time>{formatDate(e.at)}</time><span><b>{e.actor}</b> {e.detail}</span></li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Barcha murojaatlar <small>({cases.length})</small></h2>
          <div className="card-tools">
            <label className="search small"><Search size={14}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Bemor yoki hudud"/></label>
            <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Holat bo‘yicha">
              <option value="">Barcha holatlar</option>
              {STATUS_ORDER.map(st => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
            </select>
          </div>
        </div>
        <table className="table compact">
          <thead><tr><th>Bemor</th><th>Yo‘nalish</th><th>Hudud</th><th>Holat</th><th>Hujjat</th><th>Shifokor</th><th>Oxirgi faollik</th></tr></thead>
          <tbody>
            {cases.map(c => {
              const waiting = c.last_patient_message_at && (!c.last_staff_message_at || c.last_staff_message_at < c.last_patient_message_at);
              return (
                <tr key={c.case_id} className="static">
                  <td><b>{c.patient_name}</b>{waiting && <span className="waiting-tag">Javob kutmoqda</span>}</td>
                  <td>{PATHWAY_LABELS[c.pathway] || c.pathway}</td>
                  <td>{c.region || "—"}</td>
                  <td><span className={`pill status-${c.status}`}>{STATUS_LABELS[c.status]}</span></td>
                  <td>{c.documents}</td>
                  <td>{c.active_shares || <span className="muted">—</span>}</td>
                  <td>{formatDate(c.updated_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card system-card">
        <h2>Tizim</h2>
        <dl className="summary inline">
          <dt>Ma’lumotlar</dt><dd>{data.system.mode === "demo" ? "Demo (server fayli)" : "Supabase"}</dd>
          <dt>Fayllar</dt><dd>{data.system.storage === "local" ? "Server diski" : "Cloudflare R2"}</dd>
          <dt>AI provayder</dt><dd>{data.system.aiProvider === "offline" ? "Oflayn (kalitsiz)" : data.system.aiProvider}</dd>
          <dt>Ishlash vaqti</dt><dd>{data.system.uptime_minutes} daqiqa</dd>
        </dl>
        {demo && <button className="danger" disabled={resetting} onClick={() => void resetDemo()}>{resetting ? <LoaderCircle size={14} className="spin"/> : <RotateCcw size={14}/>} Demo ma’lumotlarni tiklash</button>}
      </section>
    </div>
  );
}

function Kpi({ icon, value, label, warn, onClick }: { icon: React.ReactNode; value: number; label: string; warn?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return <Tag className={`kpi${warn ? " warn" : ""}`} onClick={onClick}><span>{icon}</span><b>{value}</b><small>{label}</small></Tag>;
}
