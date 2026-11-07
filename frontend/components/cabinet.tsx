"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Check, ChevronRight, ClipboardCheck, ExternalLink, FilePlus2, FileText, FlaskConical, HeartPulse, LoaderCircle, LogOut,
  MapPin, MessageSquareText, Plus, ServerCrash, Settings2, ShieldCheck, Stethoscope, UploadCloud, UserCheck, UserRound, X,
} from "lucide-react";
import { openDocument, uploadDocument } from "../lib/api";
import { regions } from "../lib/catalog";
import { api, signOut, useAuthState } from "../lib/session";
import type { CaseBundle, CaseRow, Me, Profile } from "../lib/types";
import { AuthPanel } from "./auth-panel";
import { AccessLog, NotesPanel, SharePanel, useStatusLabel } from "./case-collaboration";
import { PreparationChecklist } from "./preparation-checklist";
import { SitePreferencesControls, useSitePreferences } from "./site-preferences";

const PATHWAYS = ["kidney", "liver", "heart", "stem_cell", "other"];
const DOC_KINDS = ["lab_result", "imaging", "referral", "identity", "other"] as const;
const MAX_BYTES = 10 * 1024 * 1024;

function Logo() { return <Link href="/" className="brand"><span className="brand-mark"><HeartPulse size={20}/></span><span>Life<span>Bridge</span></span></Link>; }

export function NotConfigured() {
  const { strings } = useSitePreferences();
  return (
    <main className="access-denied">
      <Settings2 size={38}/>
      <h1>{strings.auth_not_configured_title}</h1>
      <p>{strings.auth_not_configured_desc}</p>
      <Link className="primary-button" href="/">{strings.auth_back}</Link>
    </main>
  );
}

export function BackendDown() {
  const { strings } = useSitePreferences();
  return (
    <main className="access-denied">
      <ServerCrash size={38}/>
      <h1>{strings.backend_down_title}</h1>
      <p>{strings.backend_down_desc}</p>
      <button className="primary-button" onClick={() => window.location.reload()}>↻</button>
    </main>
  );
}

export function DemoBanner() {
  const { strings } = useSitePreferences();
  return <div className="demo-banner" role="note"><FlaskConical size={15}/><b>{strings.demo_badge}</b> {strings.demo_banner}</div>;
}

export function Cabinet() {
  const { strings } = useSitePreferences();
  const auth = useAuthState();
  if (auth.status === "loading") return <div className="cabinet-loading"><LoaderCircle className="spin"/> {strings.cab_loading}</div>;
  if (auth.status === "backend_down") return <BackendDown/>;
  if (auth.status === "misconfigured") return <NotConfigured/>;
  if (auth.status === "signed_out") return <AuthPanel/>;
  return <CabinetData demo={auth.config.mode === "demo"} key={auth.token}/>;
}

function CabinetData({ demo }: { demo: boolean }) {
  const { strings } = useSitePreferences();
  const [me, setMe] = useState<Me | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");

  const loadCases = useCallback(async () => {
    const [meData, list] = await Promise.all([api<Me>("/api/me"), api<CaseRow[]>("/api/cases")]);
    setMe(meData); setCases(list);
    return list;
  }, []);

  useEffect(() => { loadCases().catch(err => setError(err instanceof Error ? err.message : "Xatolik")); }, [loadCases]);

  if (error) return <div className="cabinet-loading" role="alert">{error} <button className="link-like" onClick={() => void signOut()}>{strings.cab_signout}</button></div>;
  if (!me) return <div className="cabinet-loading" role="status"><LoaderCircle className="spin"/> {strings.cab_roadmap_loading}</div>;
  const activeCase = cases.find(c => c.id === selected) || cases[0];
  return <Dashboard demo={demo} me={me} setProfile={profile => setMe({ ...me, profile })} cases={cases} activeCase={activeCase} selectCase={setSelected} reloadCases={loadCases}/>;
}

type DashboardProps = {
  demo: boolean; me: Me; setProfile: (p: Profile) => void; cases: CaseRow[]; activeCase?: CaseRow;
  selectCase: (id: string) => void; reloadCases: () => Promise<CaseRow[]>;
};

function Dashboard({ demo, me, setProfile, cases, activeCase, selectCase, reloadCases }: DashboardProps) {
  const { strings } = useSitePreferences();
  const statusLabel = useStatusLabel();
  const pathwayLabel = (value: string) => ({
    kidney: strings.start_pathway_kidney, liver: strings.start_pathway_liver, heart: strings.start_pathway_heart,
    stem_cell: strings.pathway_stem_cell, other: strings.start_pathway_other,
  } as Record<string, string>)[value] || value;
  const docKindLabel = (kind: string) => (strings as unknown as Record<string, string>)[`doc_kind_${kind}`] || kind;
  const profile = me.profile;

  const [notice, setNotice] = useState("");
  const [showJourney, setShowJourney] = useState(!activeCase);
  const [pathway, setPathway] = useState("kidney");
  const [region, setRegion] = useState(profile.region || "Samarqand");
  const [working, setWorking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [docKind, setDocKind] = useState<(typeof DOC_KINDS)[number]>("lab_result");
  const [fullName, setFullName] = useState(profile.full_name || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [bundle, setBundle] = useState<CaseBundle | null>(null);
  const [seenAt, setSeenAt] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  // Values chosen on the homepage "start" form arrive as ?region=…&pathway=…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("region"); const p = params.get("pathway");
    if (r && regions.includes(r)) setRegion(r);
    if (p && PATHWAYS.includes(p)) setPathway(p);
    if (r || p) setShowJourney(true);
  }, []);

  const caseId = activeCase?.id;
  const loadBundle = useCallback(async () => {
    if (!caseId) { setBundle(null); return; }
    try { setBundle(await api<CaseBundle>(`/api/cases/${caseId}`)); }
    catch (err) { setNotice(err instanceof Error ? err.message : "Xatolik"); }
  }, [caseId]);

  useEffect(() => {
    setBundle(null);
    if (!caseId) return;
    // Remember when the patient last looked at this case to highlight new doctor messages.
    const key = `inhayat_seen_${caseId}`;
    let previous = "";
    try { previous = window.localStorage.getItem(key) || ""; } catch { /* ignore */ }
    setSeenAt(previous);
    void loadBundle();
    const markSeen = window.setTimeout(() => { try { window.localStorage.setItem(key, new Date().toISOString()); } catch { /* ignore */ } }, 4000);
    const poll = window.setInterval(() => void loadBundle(), 30000);
    return () => { window.clearTimeout(markSeen); window.clearInterval(poll); };
  }, [caseId, loadBundle]);

  const phone = me.user.phone || profile.phone || "";
  const displayName = profile.full_name || phone || strings.cab_patient;
  const initials = useMemo(() => (profile.full_name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || phone.slice(-2) || "LB", [profile.full_name, phone]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      setProfile(await api<Profile>("/api/patient/profile", { method: "PUT", body: { full_name: fullName.trim().slice(0, 120), region } }));
      setNotice(strings.cab_profile_saved);
      await loadBundle();
    } catch (err) { setNotice(err instanceof Error ? err.message : strings.share_failed); }
    finally { setSavingProfile(false); }
  }

  async function createJourney(e: FormEvent) {
    e.preventDefault();
    if (working) return;
    setWorking(true);
    try {
      const created = await api<CaseRow>("/api/cases", { body: { pathway, region } });
      setShowJourney(false);
      setNotice("Yangi yo‘l xaritasi yaratildi.");
      window.history.replaceState(null, "", "/cabinet");
      await reloadCases();
      selectCase(created.id);
    } catch (err) { setNotice(err instanceof Error ? err.message : "Xatolik"); }
    finally { setWorking(false); }
  }

  async function handleFile(file: File | undefined) {
    if (!file || !activeCase || uploading) return;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size > MAX_BYTES) {
      setNotice("PDF/JPG/PNG faylini va 10 MB gacha hajmni tanlang.");
      return;
    }
    setUploading(true);
    try {
      await uploadDocument(file, activeCase.id, docKind);
      setNotice("Fayl xavfsiz yuklandi.");
      await loadBundle();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Yuklashda xatolik yuz berdi.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); void handleFile(e.dataTransfer.files?.[0]); };

  async function view(id: string) {
    try { await openDocument(id); } catch (err) { setNotice(err instanceof Error ? err.message : strings.doc_open_failed); }
  }

  const status = bundle?.case.status || activeCase?.status || "draft";
  const docs = bundle?.documents ?? [];
  const notes = bundle?.notes ?? [];
  const activeShares = (bundle?.shares ?? []).filter(s => s.active);
  const staffNotes = notes.filter(n => n.author_is_staff && n.kind !== "status");
  const unread = staffNotes.filter(n => n.created_at > seenAt).length;
  const lastPatientNote = notes.filter(n => !n.author_is_staff).map(n => n.created_at).pop() || "";
  const lastStaffNote = staffNotes[staffNotes.length - 1];
  const lastDocAt = docs[0]?.uploaded_at || "";
  const contacted = status === "centre_contacted" || status === "closed";

  // Single, most useful next action for the patient.
  const next = !profile.full_name ? { t: strings.nx_profile_t, d: strings.nx_profile_d, href: "#profile", icon: <UserRound size={20}/> }
    : docs.length === 0 ? { t: strings.nx_upload_t, d: strings.nx_upload_d, href: "#documents", icon: <UploadCloud size={20}/> }
    : activeShares.length === 0 ? { t: strings.nx_share_t, d: strings.nx_share_d, href: "#share", icon: <UserCheck size={20}/> }
    : lastStaffNote?.kind === "document_request" && lastDocAt < lastStaffNote.created_at ? { t: strings.nx_request_t, d: lastStaffNote.body, href: "#documents", icon: <FilePlus2 size={20}/> }
    : lastStaffNote?.kind === "conclusion" && lastStaffNote.created_at > lastPatientNote ? { t: strings.nx_conclusion_t, d: strings.nx_conclusion_d, href: "#messages", icon: <Stethoscope size={20}/> }
    : { t: strings.nx_wait_t, d: strings.nx_wait_d, href: "#checklist", icon: <ClipboardCheck size={20}/> };

  return (
    <main className="cabinet">
      <aside className="sidebar">
        <Logo/>
        <div className="user-chip">
          <span>{initials}</span>
          <div>
            <b>{displayName}</b>
            <small>{strings.cab_personal}</small>
          </div>
        </div>
        <nav>
          <a className="active" href="#top"><HeartPulse size={17}/> {strings.cab_nav_roadmap}</a>
          <a href="#documents"><FileText size={17}/> {strings.cab_nav_docs}</a>
          <a href="#share"><UserCheck size={17}/> {strings.share_title}</a>
          <a href="#messages"><MessageSquareText size={17}/> {strings.notes_title}{unread > 0 && <em className="nav-badge">{unread}</em>}</a>
          <a href="/#centres"><MapPin size={17}/> {strings.cab_nav_centres}</a>
        </nav>
        <button className="signout" onClick={() => void signOut()}>
          <LogOut size={17}/> {strings.cab_signout}
        </button>
      </aside>
      <section className="cabinet-main" id="top">
        {demo && <DemoBanner/>}
        <header>
          <div>
            <div className="eyebrow">{strings.cab_personal}</div>
            <h1>{profile.full_name ? `${strings.cab_hello.replace(/\.$/, "")}, ${profile.full_name.split(/\s+/).slice(-1)[0]}.` : strings.cab_hello}</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <SitePreferencesControls />
            <button className="new-case" onClick={() => setShowJourney(true)}>
              <Plus size={17}/> {strings.cab_new_journey}
            </button>
          </div>
        </header>

        {notice && (
          <div className="notice">
            <Check size={17}/>{notice}
            <button onClick={() => setNotice("")} aria-label="Yopish"><X size={16}/></button>
          </div>
        )}

        {activeCase && (
          <div className="overview-row">
            <a href="#documents" className="ov-card"><FileText size={18}/><b>{docs.length}</b><span>{strings.ov_docs}</span></a>
            <a href="#share" className="ov-card"><Stethoscope size={18}/><b>{activeShares.length}</b><span>{strings.ov_doctors}</span></a>
            <a href="#checklist" className="ov-card"><ClipboardCheck size={18}/><b>{bundle?.checklist.length ?? 0}/5</b><span>{strings.ov_checklist}</span></a>
            <a href="#messages" className={unread ? "ov-card attention" : "ov-card"}><MessageSquareText size={18}/><b>{unread}</b><span>{strings.ov_messages}</span></a>
          </div>
        )}

        {activeCase && bundle && (
          <a className="next-step-card" href={next.href}>
            <span className="next-icon">{next.icon}</span>
            <div>
              <small>{strings.nx_title}</small>
              <b>{next.t}</b>
              <p>{next.d}</p>
            </div>
            <span className="next-go">{strings.nx_go} <ArrowRight size={15}/></span>
          </a>
        )}

        <form className="profile-form" id="profile" onSubmit={saveProfile}>
          <div>
            <h2>{strings.cab_profile_title}</h2>
            <p>{strings.cab_profile_desc}</p>
          </div>
          <label>
            {strings.cab_profile_name}
            <input value={fullName} onChange={e => setFullName(e.target.value)} maxLength={120} autoComplete="name" placeholder="Aliyev Anvar"/>
          </label>
          <label>
            {strings.cab_region_label}
            <select value={region} onChange={e => setRegion(e.target.value)}>
              {regions.map(item => <option key={item}>{item}</option>)}
            </select>
          </label>
          <button disabled={savingProfile}>{savingProfile ? <LoaderCircle size={15} className="spin"/> : <Check size={15}/>} {strings.cab_profile_save}</button>
        </form>

        {cases.length > 1 && (
          <label className="case-selector">
            {strings.cab_roadmap_select}
            <select value={activeCase?.id || ""} onChange={e => selectCase(e.target.value)}>
              {cases.map(c => (
                <option key={c.id} value={c.id}>
                  {pathwayLabel(c.transplant_pathway)} · {c.preferred_region} · {new Date(c.created_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>
        )}

        {showJourney && (
          <form className="journey-form reveal" onSubmit={createJourney}>
            <div>
              <span className="form-icon"><Plus size={18}/></span>
              <h2>{strings.cab_create_title}</h2>
              <p>{strings.cab_create_desc}</p>
            </div>
            <label>
              {strings.cab_pathway_label}
              <select value={pathway} onChange={e => setPathway(e.target.value)}>
                {PATHWAYS.map(value => <option key={value} value={value}>{pathwayLabel(value)}</option>)}
              </select>
            </label>
            <label>
              {strings.cab_region_label}
              <select value={region} onChange={e => setRegion(e.target.value)}>
                {regions.map(item => <option key={item}>{item}</option>)}
              </select>
            </label>
            <div className="form-actions">
              {cases.length > 0 && (
                <button type="button" className="secondary-action" onClick={() => setShowJourney(false)}>
                  {strings.cab_cancel}
                </button>
              )}
              <button disabled={working}>
                {working && <LoaderCircle className="spin"/>} {strings.cab_create_btn} <ChevronRight size={17}/>
              </button>
            </div>
          </form>
        )}

        {activeCase && (
          <>
            <section className="case-overview reveal">
              <div className="case-heading">
                <span className="status-dot"/>
                <div>
                  <small>{strings.cab_active_journey}</small>
                  <h2>{pathwayLabel(activeCase.transplant_pathway)}</h2>
                  <span><MapPin size={13}/>{activeCase.preferred_region || "—"}</span>
                  <span className={`status-pill status-${status}`}>{strings.status_label}: {statusLabel(status)}</span>
                </div>
                <button onClick={() => setShowJourney(true)}>
                  {strings.cab_add_another_journey} <Plus size={15}/>
                </button>
              </div>
              <div className="journey-rail">
                {([
                  [strings.cab_step_profile, !!profile.full_name],
                  [strings.cab_step_docs, docs.length > 0],
                  [strings.cab_step_contact, contacted],
                  [strings.cab_step_travel, status === "closed"],
                ] as const).map(([title, done], index) => (
                  <div className={done ? "rail-step done" : "rail-step"} key={title}>
                    <i>{done ? <Check size={13}/> : index + 1}</i>
                    <span>{title}</span>
                  </div>
                ))}
              </div>
            </section>

            {bundle ? (
              <>
                <div className="dashboard-grid">
                  <section className="documents-panel" id="documents">
                    <div className="panel-title">
                      <div>
                        <span className="panel-icon"><FileText size={18}/></span>
                        <h2>{strings.cab_docs_title}</h2>
                        <p>{strings.cab_docs_sub}</p>
                      </div>
                    </div>
                    <div className={`dropzone${dragging ? " dragging" : ""}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
                      {uploading ? <LoaderCircle className="spin" size={26}/> : <UploadCloud size={26}/>}
                      <b>{uploading ? strings.cab_uploading : strings.drop_hint}</b>
                      <small>{strings.drop_types}</small>
                      <div className="upload-controls">
                        <select value={docKind} onChange={e => setDocKind(e.target.value as typeof docKind)} aria-label={strings.cab_doc_kind}>
                          {DOC_KINDS.map(kind => <option key={kind} value={kind}>{docKindLabel(kind)}</option>)}
                        </select>
                        <label className="upload-button">
                          <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e: ChangeEvent<HTMLInputElement>) => void handleFile(e.target.files?.[0])} disabled={uploading}/>
                          <UploadCloud size={17}/> {strings.cab_upload_btn}
                        </label>
                      </div>
                    </div>
                    {docs.length ? (
                      <div className="doc-list">
                        {docs.map(doc => (
                          <div className="doc-row" key={doc.id}>
                            <span><FileText size={18}/></span>
                            <div>
                              <b>{doc.original_name}</b>
                              <small>{new Date(doc.uploaded_at).toLocaleDateString()} · {docKindLabel(doc.kind)}</small>
                            </div>
                            <button className="doc-open" onClick={() => void view(doc.id)}><ExternalLink size={14}/> {strings.doc_open}</button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-docs">
                        <FilePlus2 size={25}/>
                        <b>{strings.cab_empty_docs}</b>
                        <span>{strings.cab_empty_docs_desc}</span>
                      </div>
                    )}
                    <AccessLog entries={bundle.accessLog}/>
                  </section>
                  <PreparationChecklist caseId={activeCase.id} initial={bundle.checklist} onChange={completed => setBundle({ ...bundle, checklist: completed })}/>
                </div>

                <div className="collab-grid">
                  <SharePanel caseId={activeCase.id} shares={bundle.shares} onChanged={loadBundle}/>
                  <NotesPanel caseId={activeCase.id} userId={me.user.id} notes={notes} seenAt={seenAt} onChanged={loadBundle}/>
                </div>
                <p className="security-foot"><ShieldCheck size={15}/> {strings.cab_security_tip}</p>
              </>
            ) : <div className="cabinet-loading inline" role="status"><LoaderCircle className="spin"/> {strings.cab_roadmap_loading}</div>}
          </>
        )}
      </section>
    </main>
  );
}
