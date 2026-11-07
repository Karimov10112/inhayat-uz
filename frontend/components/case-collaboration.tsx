"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Eye, LoaderCircle, MessageSquareText, Search, Send, ShieldCheck, Stethoscope, UserCheck, X } from "lucide-react";
import { api } from "../lib/session";
import type { AccessEntry, DirectoryEntry, Note, Share } from "../lib/types";
import { useSitePreferences } from "./site-preferences";

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function useStatusLabel() {
  const { strings } = useSitePreferences();
  return (status: string) => ({
    draft: strings.status_draft,
    documents_pending: strings.status_documents_pending,
    under_review: strings.status_under_review,
    centre_contacted: strings.status_centre_contacted,
    closed: strings.status_closed,
  } as Record<string, string>)[status] || status;
}

export function SharePanel({ caseId, shares, onChanged }: { caseId: string; shares: Share[]; onChanged: () => Promise<void> }) {
  const { strings } = useSitePreferences();
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    api<DirectoryEntry[]>("/api/staff/directory")
      .then(rows => { if (alive) setDirectory(rows); })
      .catch(() => { if (alive) setMessage(strings.share_failed); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [strings.share_failed]);

  const active = shares.filter(s => s.active);
  const activeIds = useMemo(() => new Set(active.map(s => s.staff_id)), [active]);
  const filtered = directory.filter(d => !activeIds.has(d.id) && `${d.full_name} ${d.speciality} ${d.organization} ${d.region}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const roleLabel = (role: string) => role === "coordinator" ? strings.role_coordinator : strings.role_doctor;
  const describe = (s: DirectoryEntry) => [roleLabel(s.role), s.speciality, s.organization, s.region].filter(Boolean).join(" · ");

  async function setAccess(staffId: string, on: boolean) {
    if (working) return;
    setWorking(staffId); setMessage("");
    try {
      await api(`/api/cases/${caseId}/shares/${staffId}`, { method: "PUT", body: { active: on } });
      setMessage(on ? strings.share_done : strings.share_revoked);
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : strings.share_failed);
    } finally { setWorking(""); }
  }

  return (
    <section className="collab-panel" id="share">
      <div className="collab-heading">
        <span className="panel-icon"><UserCheck size={18}/></span>
        <div>
          <h2>{strings.share_title}</h2>
          <p>{strings.share_desc}</p>
        </div>
      </div>

      {active.length > 0 && (
        <div className="share-active">
          <small>{strings.share_active}</small>
          {active.map(share => (
            <div className="staff-row active" key={share.staff_id}>
              <span className="staff-avatar"><Stethoscope size={16}/></span>
              <div>
                <b>{share.staff?.full_name || "—"}</b>
                <small>{share.staff ? describe(share.staff) : ""}</small>
              </div>
              <button className="ghost-danger" disabled={!!working} onClick={() => void setAccess(share.staff_id, false)}>
                {working === share.staff_id ? <LoaderCircle size={14} className="spin"/> : <X size={14}/>} {strings.share_revoke}
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="search-field collab-search">
        <Search size={16}/>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={strings.share_search} aria-label={strings.share_search}/>
      </label>

      {loading ? <p role="status"><LoaderCircle size={14} className="spin"/></p> : filtered.length === 0 && active.length === 0 ? (
        <p className="collab-empty">{strings.share_none}</p>
      ) : (
        <div className="staff-list">
          {filtered.slice(0, 8).map(staff => (
            <div className="staff-row" key={staff.id}>
              <span className="staff-avatar"><Stethoscope size={16}/></span>
              <div>
                <b>{staff.full_name}</b>
                <small>{describe(staff)}</small>
              </div>
              <button disabled={!!working} onClick={() => void setAccess(staff.id, true)}>
                {working === staff.id ? <LoaderCircle size={14} className="spin"/> : <ShieldCheck size={14}/>} {strings.share_btn}
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="collab-message" role="status">{message}</p>
    </section>
  );
}

export function NotesPanel({ caseId, userId, notes, seenAt, onChanged }: { caseId: string; userId: string; notes: Note[]; seenAt: string; onChanged: () => Promise<void> }) {
  const { strings } = useSitePreferences();
  const statusLabel = useStatusLabel();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function send(e: FormEvent) {
    e.preventDefault();
    if (sending || !text.trim()) return;
    setSending(true); setError("");
    try {
      await api(`/api/cases/${caseId}/notes`, { body: { kind: "message", body: text.trim().slice(0, 4000) } });
      setText("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.share_failed);
    } finally { setSending(false); }
  }

  const kindLabel = (kind: Note["kind"]) => kind === "conclusion" ? strings.note_kind_conclusion : kind === "document_request" ? strings.note_kind_document_request : kind === "status" ? strings.note_kind_status : "";

  return (
    <section className="collab-panel" id="messages">
      <div className="collab-heading">
        <span className="panel-icon"><MessageSquareText size={18}/></span>
        <div><h2>{strings.notes_title}</h2></div>
      </div>
      <div className="note-thread">
        {notes.length === 0 && <p className="collab-empty">{strings.notes_empty}</p>}
        {notes.map(note => (
          <article key={note.id} className={`note ${note.author_id === userId ? "mine" : "theirs"} kind-${note.kind}`}>
            <header>
              <b>{note.author_id === userId ? strings.notes_you : note.author_name || "—"}</b>
              {note.kind !== "message" && <span className="note-kind">{kindLabel(note.kind)}</span>}
              {note.author_is_staff && note.kind !== "status" && note.created_at > seenAt && <span className="new-dot">{strings.new_badge}</span>}
              <time>{formatDate(note.created_at)}</time>
            </header>
            <p>{note.kind === "status" ? statusLabel(note.body) : note.body}</p>
          </article>
        ))}
      </div>
      <form className="note-form" onSubmit={send}>
        <textarea value={text} onChange={e => setText(e.target.value)} maxLength={4000} rows={2} placeholder={strings.notes_placeholder} aria-label={strings.notes_placeholder}/>
        <button disabled={sending || !text.trim()}>{sending ? <LoaderCircle size={15} className="spin"/> : <Send size={15}/>} {strings.notes_send}</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

export function AccessLog({ entries }: { entries: AccessEntry[] }) {
  const { strings } = useSitePreferences();
  return (
    <div className="access-log">
      <h3><Eye size={15}/> {strings.access_log_title}</h3>
      {entries.length === 0 ? <small>{strings.access_log_empty}</small> : (
        <ul>
          {entries.map(entry => (
            <li key={entry.id}><b>{entry.viewer_name || "—"}</b> · {entry.document_name} · <time>{formatDate(entry.viewed_at)}</time></li>
          ))}
        </ul>
      )}
    </div>
  );
}
