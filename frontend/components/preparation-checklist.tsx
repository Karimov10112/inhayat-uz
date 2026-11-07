"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/session";
import { useSitePreferences } from "./site-preferences";

export function PreparationChecklist({ caseId, initial, onChange }: { caseId: string; initial: string[]; onChange?: (completed: string[]) => void }) {
  const { strings } = useSitePreferences();
  const [completed, setCompleted] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { setCompleted(initial); }, [initial]);

  const tasks = [
    ["clinic", strings.chk_task_clinic],
    ["consultation", strings.chk_task_consultation],
    ["documents", strings.chk_task_documents],
    ["centre", strings.chk_task_centre],
    ["travel", strings.chk_task_travel],
  ] as const;

  async function toggle(id: string) {
    if (saving) return;
    setSaving(true); setMessage("");
    const next = completed.includes(id) ? completed.filter(item => item !== id) : [...completed, id];
    try {
      const saved = await api<{ completed: string[] }>(`/api/cases/${caseId}/checklist`, { method: "PUT", body: { completed: next } });
      setCompleted(saved.completed); onChange?.(saved.completed); setMessage(strings.chk_saved);
    } catch { setMessage("Saqlanmadi. Qayta urinib ko‘ring."); }
    finally { setSaving(false); }
  }

  return (
    <section className="preparation-checklist" id="checklist">
      <div className="checklist-heading">
        <div>
          <h2>{strings.chk_title}</h2>
          <p>{strings.chk_desc}</p>
        </div>
        <strong>{completed.length} / {tasks.length}</strong>
      </div>
      <progress max={tasks.length} value={completed.length} aria-label={strings.chk_title}/>
      {tasks.map(([id, label]) => (
        <label key={id}>
          <input type="checkbox" checked={completed.includes(id)} disabled={saving} onChange={() => void toggle(id)}/>
          <span>{label}</span>
        </label>
      ))}
      <p className="checklist-message" role="status">{saving ? strings.chk_saving : message}</p>
      <a href="/#clinics">{strings.chk_find_clinics}</a>
    </section>
  );
}
