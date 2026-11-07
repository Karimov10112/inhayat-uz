"use client";
import { useEffect, useState, type FormEvent } from "react";
import { type Session } from "@supabase/supabase-js";
import Link from "next/link";
import { ArrowLeft, Building2, Check, HeartPulse, LoaderCircle, LogOut, Pencil, Plus, Search, ShieldCheck, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { signOutUser } from "../lib/auth-service";
import { regions } from "../lib/catalog";
import { AuthPanel } from "./auth-panel";
import { NotConfigured } from "./cabinet";
import { SitePreferencesControls } from "./site-preferences";

type Entry = { id: string; name: string; address: string; phone: string; source_url: string; region?: string; speciality?: string; pathways?: string[]; active: boolean };
const empty = { id: '', name: '', address: '', phone: '', source_url: '', region: 'Samarqand', speciality: '', pathways: ['kidney'], active: true };
export function AdminPanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'centres' | 'clinics'>('centres');
  const [rows, setRows] = useState<Entry[]>([]); const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<Entry | null>(null); const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const isAdmin = session?.user.app_metadata?.role === 'admin';
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  async function reload() {
    if (!supabase || !isAdmin) return;
    const { data, error } = await supabase.from(tab).select('*').order('name');
    if (error) { setError('Katalog yuklanmadi. Baza migratsiyasi va admin ruxsatini tekshiring.'); setRows([]); }
    else setRows(data as Entry[]);
  }
  useEffect(() => { setRows([]); setEditor(null); setError(''); reload(); }, [tab, isAdmin]);
  async function save(e: FormEvent) {
    e.preventDefault(); if (!supabase || !editor || saving) return;
    setError(''); setMessage('');
    if (!/^https:\/\//i.test(editor.source_url)) { setError('Rasmiy manba https:// bilan boshlanishi kerak.'); return; }
    setSaving(true);
    const values: Record<string, unknown> = { name: editor.name.trim(), address: editor.address.trim(), phone: (editor.phone || '').trim(), source_url: editor.source_url.trim(), active: editor.active, ...(tab === 'clinics' ? { region: editor.region } : { speciality: editor.speciality, pathways: editor.pathways, verified_at: new Date().toISOString() }) };
    const result = editor.id ? await supabase.from(tab).update(values).eq('id', editor.id).select('id').single() : await supabase.from(tab).insert(values).select('id').single();
    setSaving(false);
    if (result.error) setError('Saqlab bo‘lmadi. Ruxsat, takroriy nom yoki baza sozlamalarini tekshiring.');
    else { setEditor(null); setMessage('O‘zgarishlar saqlandi. Faol yozuvlar ommaviy katalogda ko‘rinadi.'); await reload(); }
  }
  async function toggle(row: Entry) {
    if (!supabase || saving) return;
    setSaving(true); setError('');
    const { error } = await supabase.from(tab).update({ active: !row.active }).eq('id', row.id).select('id').single();
    setSaving(false); if (error) setError('Holat o‘zgarmadi. Qayta urinib ko‘ring.'); else { setMessage('Ko‘rinish holati yangilandi.'); await reload(); }
  }
  if (!supabase) return <NotConfigured/>;
  if (loading) return <div className="cabinet-loading"><LoaderCircle className="spin"/>Yuklanmoqda…</div>;
  if (!session) return <AuthPanel admin/>;
  if (!isAdmin) return <main className="access-denied"><ShieldCheck size={38}/><h1>Admin ruxsati kerak.</h1><p>Ushbu hisobga boshqaruv huquqi berilmagan.</p><Link className="primary-button" href="/cabinet">Shaxsiy kabinetga qaytish</Link></main>;
  const filtered = rows.filter(r => `${r.name} ${r.address} ${r.region || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <main className="admin-shell"><aside className="admin-sidebar"><Link className="brand" href="/"><span className="brand-mark"><HeartPulse size={20}/></span><span>Life<span>Bridge</span></span></Link><div className="admin-label"><ShieldCheck size={14}/> Boshqaruv paneli</div><nav><button className={tab === 'centres' ? 'active' : ''} onClick={() => setTab('centres')}><Building2 size={17}/> Tibbiy markazlar</button><button className={tab === 'clinics' ? 'active' : ''} onClick={() => setTab('clinics')}><Plus size={17}/> Hududiy klinikalar</button></nav><div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}><SitePreferencesControls /><Link href="/" className="admin-back"><ArrowLeft size={16}/> Saytga qaytish</Link><button className="admin-signout" onClick={() => signOutUser()}><LogOut size={16}/> Chiqish</button></div></aside><section className="admin-content"><header><div><div className="eyebrow">Katalog boshqaruvi</div><h1>{tab === 'centres' ? 'Ixtisoslashgan markazlar' : 'Hududiy klinikalar'}</h1><p>Ma’lumotlarni tekshiring, tahrirlang va katalogga joylang.</p></div><button className="primary-button" onClick={() => { setEditor({ ...empty }); setError(''); }}><Plus size={17}/> Qo‘shish</button></header><div className="admin-metrics"><article><span>Katalogda jami</span><b>{rows.length}</b></article><article><span>Saytda ko‘rinadi</span><b>{rows.filter(r => r.active).length}</b></article><article><span>Yashirilgan</span><b>{rows.filter(r => !r.active).length}</b></article></div>{message && <div className="notice" role="status"><Check size={16}/>{message}</div>}{error && <div className="form-error" role="alert">{error}</div>}<label className="search-field admin-search"><Search size={17}/><input placeholder="Nom, hudud yoki manzil bo‘yicha qidirish" aria-label="Katalogda qidirish" value={query} onChange={e => setQuery(e.target.value)}/></label><div className="admin-list">{filtered.map(row => <article className="admin-entry" key={row.id}><span className="hospital-icon"><Building2 size={20}/></span><div><h3>{row.name}</h3><p>{row.address}</p><a href={row.source_url} target="_blank" rel="noreferrer">Rasmiy manba ↗</a></div><button className={row.active ? 'visibility active' : 'visibility'} disabled={saving} onClick={() => toggle(row)}>{row.active ? 'Faol' : 'Yashirilgan'}</button><button className="edit-entry" aria-label={`${row.name} — tahrirlash`} onClick={() => setEditor({ ...row })}><Pencil size={16}/></button></article>)}{!filtered.length && <div className="catalog-empty">Yozuv topilmadi. Katalogga yangi muassasa qo‘shishingiz mumkin.</div>}</div>{editor && <section className="admin-editor" aria-label="Katalog yozuvini tahrirlash"><div className="editor-heading"><h2>{editor.id ? 'Ma’lumotlarni tahrirlash' : 'Yangi muassasa'}</h2><button aria-label="Tahrirni yopish" onClick={() => setEditor(null)}><X size={20}/></button></div><form onSubmit={save}><label>Muassasa nomi<input required maxLength={240} value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })}/></label>{tab === 'clinics' ? <label>Hudud<select value={editor.region} onChange={e => setEditor({ ...editor, region: e.target.value })}>{regions.map(r => <option key={r}>{r}</option>)}</select></label> : <><label>Yo‘nalish tavsifi<input required value={editor.speciality || ''} onChange={e => setEditor({ ...editor, speciality: e.target.value })}/></label><label>Transplantatsiya yo‘nalishi<select value={editor.pathways?.[0] || 'other'} onChange={e => setEditor({ ...editor, pathways: [e.target.value] })}><option value="kidney">Buyrak</option><option value="liver">Jigar</option><option value="heart">Yurak</option><option value="stem_cell">O‘zak hujayra</option><option value="other">Boshqa</option></select></label></>}<label>Manzil<input required value={editor.address} onChange={e => setEditor({ ...editor, address: e.target.value })}/></label><label>Telefon<input type="tel" value={editor.phone || ''} onChange={e => setEditor({ ...editor, phone: e.target.value })}/></label><label>Rasmiy manba<input required type="url" placeholder="https://" value={editor.source_url} onChange={e => setEditor({ ...editor, source_url: e.target.value })}/></label><label className="checkbox-label"><input type="checkbox" checked={editor.active} onChange={e => setEditor({ ...editor, active: e.target.checked })}/> Saytda ko‘rsatish</label><button className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17}/> : <Check size={17}/>} Saqlash</button></form></section>}</section></main>;
}
