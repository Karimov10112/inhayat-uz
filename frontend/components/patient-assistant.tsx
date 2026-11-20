"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "../lib/session";

const options = [["preparation", "Tayyorgarlik"], ["documents", "Hujjatlar"], ["contact", "Bog‘lanish"]] as const;
type Report = { stats: { total: number; active: number }; answer: string; source: string };

export function PatientAssistant() {
  const [topic, setTopic] = useState<string>("preparation");
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setReport(undefined);
    setError(false);
    api<Report>(`/api/assistant?topic=${topic}`).then(result => { if (active) setReport(result); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [topic]);
  return <section className="patient-assistant" aria-labelledby="assistant-title">
    <h2 id="assistant-title"><Sparkles size={20}/> InHayat yordamchisi</h2>
    {report && <p className="assistant-stats"><span><b>{report.stats.total}</b> jami murojaat</span><span><b>{report.stats.active}</b> faol murojaat</span></p>}
    <div className="assistant-topics" aria-label="Yordam mavzusi">
      {options.map(([value, label]) => <button key={value} type="button" aria-pressed={topic === value} onClick={() => setTopic(value)}>{label}</button>)}
    </div>
    <p aria-live="polite">{error ? "Yordamchi vaqtincha yuklanmadi." : report?.answer ?? "Yo‘l-yo‘riq yuklanmoqda…"}</p>
    {report && <small>{report.source === "ai" ? "AI tahrirlagan platforma yo‘riqnomasi" : "Platforma yo‘riqnomasi"} · Tibbiy savollar uchun shifokoringizga murojaat qiling.</small>}
  </section>;
}
