"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, LoaderCircle, LogOut } from "lucide-react";
import { supabase } from "../lib/supabase";
import { api } from "../lib/session";
import { REGIONS } from "../lib/labels";
import type { StaffProfile } from "../lib/types";
import { Brand, DemoStrip } from "./portal-app";

export type { StaffProfile };

const OTHER = "__other__";

// Shown when the Supabase catalogue is not connected (demo mode).
const DEMO_ORGS = [
  "Respublika ixtisoslashtirilgan nefrologiya va buyrak transplantatsiyasi markazi",
  "Respublika ixtisoslashtirilgan gematologiya ilmiy-amaliy tibbiyot markazi",
  "Akademik V. Vohidov nomidagi Respublika ixtisoslashtirilgan xirurgiya markazi",
  "Respublika shoshilinch tibbiy yordam ilmiy markazi (RSHTYoIM)",
  "Bolalar milliy tibbiyot markazi",
  "Samarqand viloyat ko‘p tarmoqli tibbiyot markazi",
  "Buxoro viloyat ko‘p tarmoqli tibbiyot markazi",
];

export function ApplicationForm({ email, existing, demo, onSaved, onSignOut }: { email: string; existing: StaffProfile | null; demo: boolean; onSaved: () => void; onSignOut: () => void }) {
  const [organizations, setOrganizations] = useState<string[]>(DEMO_ORGS);
  const [form, setForm] = useState({
    full_name: existing?.full_name || "",
    role: existing?.role || "doctor",
    speciality: existing?.speciality || "",
    license_number: existing?.license_number || "",
    organization: existing?.organization || "",
    region: existing?.region || "Toshkent shahri",
    phone: existing?.phone || "+998",
  });
  const [orgChoice, setOrgChoice] = useState(existing?.organization ? (DEMO_ORGS.includes(existing.organization) ? existing.organization : OTHER) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // With Supabase, institutions come from the public catalogue.
  useEffect(() => {
    if (!supabase) return;
    Promise.all([supabase.from("centres").select("name").eq("active", true), supabase.from("clinics").select("name").eq("active", true)])
      .then(([centres, clinics]) => {
        const names = [...(centres.data ?? []), ...(clinics.data ?? [])].map(row => row.name as string).sort((a, b) => a.localeCompare(b));
        if (!names.length) return;
        setOrganizations(names);
        if (existing?.organization) setOrgChoice(names.includes(existing.organization) ? existing.organization : OTHER);
      });
  }, [existing?.organization]);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    const organization = orgChoice && orgChoice !== OTHER ? orgChoice : form.organization.trim();
    const values = { ...form, full_name: form.full_name.trim(), speciality: form.speciality.trim(), license_number: form.license_number.trim(), organization, phone: form.phone.replace(/[^\d+]/g, "") };
    if (values.full_name.split(/\s+/).length < 2) { setError("Familiya va ismingizni to‘liq kiriting."); return; }
    if (values.license_number.length < 3) { setError("Litsenziya yoki diplom raqamini kiriting."); return; }
    if (organization.length < 3) { setError("Ish joyingizni tanlang yoki yozing."); return; }
    if (!/^\+998\d{9}$/.test(values.phone)) { setError("Telefon: +998XXXXXXXXX ko‘rinishida."); return; }
    setBusy(true);
    try { await api("/api/staff/me", { method: "PUT", body: values }); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : "Ariza saqlanmadi."); }
    finally { setBusy(false); }
  }

  return (
    <main className="centered">
      <Brand/>
      {demo && <DemoStrip/>}
      <section className="card wide">
        <div className="card-icon"><BadgeCheck size={30}/></div>
        <h1>{existing ? "Arizani yangilash" : "Xodim arizasi"}</h1>
        <p className="muted">Ma’lumotlaringiz administrator tomonidan tekshiriladi. Tasdiqlangandan keyin bemorlar sizni ro‘yxatdan tanlab, o‘z ma’lumotlarini ulasha oladi. Hisob: <b>{email}</b></p>
        <form className="grid-form" onSubmit={submit}>
          <label className="span-2">Familiya, ism, otasining ismi
            <input value={form.full_name} onChange={set("full_name")} required maxLength={120} placeholder="Karimov Anvar Rustamovich"/>
          </label>
          <label>Rol
            <select value={form.role} onChange={set("role")}>
              <option value="doctor">Shifokor</option>
              <option value="coordinator">Klinika koordinatori</option>
            </select>
          </label>
          <label>Mutaxassislik
            <input value={form.speciality} onChange={set("speciality")} maxLength={160} placeholder="Nefrolog, transplantolog…"/>
          </label>
          <label>Litsenziya / diplom raqami
            <input value={form.license_number} onChange={set("license_number")} required maxLength={60}/>
          </label>
          <label>Ish telefoni
            <input type="tel" value={form.phone} onChange={set("phone")} required maxLength={13}/>
          </label>
          <label className="span-2">Ish joyi (muassasa)
            <select value={orgChoice} onChange={e => setOrgChoice(e.target.value)} required>
              <option value="" disabled>Tanlang…</option>
              {organizations.map(name => <option key={name} value={name}>{name}</option>)}
              <option value={OTHER}>Boshqa muassasa (qo‘lda yozish)</option>
            </select>
          </label>
          {orgChoice === OTHER && (
            <label className="span-2">Muassasa nomi
              <input value={form.organization} onChange={set("organization")} required maxLength={240}/>
            </label>
          )}
          <label>Hudud
            <select value={form.region} onChange={set("region")}>
              {REGIONS.map(region => <option key={region}>{region}</option>)}
            </select>
          </label>
          <div className="span-2 form-footer">
            <button type="button" className="link-button" onClick={onSignOut}><LogOut size={14}/> Chiqish</button>
            <button className="primary" disabled={busy}>{busy && <LoaderCircle size={16} className="spin"/>} Arizani yuborish</button>
          </div>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
