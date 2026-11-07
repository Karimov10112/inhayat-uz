"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Clock3, FlaskConical, HeartPulse, LayoutDashboard, LoaderCircle, LogOut, ServerCrash, Settings2, ShieldCheck, ShieldX, Stethoscope, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import { api, signOut, useAuthState } from "../lib/session";
import { ROLE_LABELS, STAFF_STATUS_LABELS } from "../lib/labels";
import type { Me } from "../lib/types";
import { AuthScreen, NewPasswordForm } from "./auth-screen";
import { ApplicationForm } from "./application-form";
import { DoctorWorkspace } from "./doctor-workspace";
import { AdminReviews } from "./admin-reviews";
import { AdminDashboard } from "./admin-dashboard";
import { AgentConsole } from "./agent-console";

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark"><HeartPulse size={18}/></span>
      <span>InHayat <em>Pro</em></span>
    </span>
  );
}

export function Centered({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <main className="centered">
      <Brand/>
      <section className="card narrow">
        <div className="card-icon">{icon}</div>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function DemoStrip() {
  return <div className="demo-strip"><FlaskConical size={14}/><b>DEMO</b> Ma’lumotlar sinov serverida. Haqiqiy bemor ma’lumotlarini kiritmang.</div>;
}

type Tab = "patients" | "dashboard" | "reviews" | "agent";

export function PortalApp() {
  const auth = useAuthState();
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(event => { if (event === "PASSWORD_RECOVERY") setRecovery(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  if (auth.status === "loading") return <div className="loading"><LoaderCircle className="spin"/> Yuklanmoqda…</div>;
  if (auth.status === "backend_down") {
    return <Centered icon={<ServerCrash size={36}/>} title="Server bilan bog‘lanib bo‘lmadi">
      <p>Backend ishga tushirilganini tekshiring: <code>npm run dev:backend</code> (http://localhost:4000).</p>
      <button className="primary" onClick={() => window.location.reload()}>Qayta urinish</button>
    </Centered>;
  }
  if (auth.status === "misconfigured") {
    return <Centered icon={<Settings2 size={36}/>} title="Portal sozlanmagan">
      <p>Backend Supabase rejimida, lekin portalda <code>NEXT_PUBLIC_SUPABASE_URL</code> va <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> yo‘q. <code>portal/.env.local</code> faylini to‘ldiring.</p>
    </Centered>;
  }
  if (auth.status === "signed_out") return <AuthScreen config={auth.config}/>;
  if (recovery) return <NewPasswordForm onDone={() => setRecovery(false)}/>;
  return <SignedIn key={auth.token} demo={auth.config.mode === "demo"}/>;
}

function SignedIn({ demo }: { demo: boolean }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);

  const load = useCallback(async () => {
    setError("");
    try { setMe(await api<Me>("/api/me")); }
    catch (err) { setError(err instanceof Error ? err.message : "Xatolik"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <Centered icon={<ShieldX size={36}/>} title="Xatolik"><p>{error}</p><button className="link-button" onClick={() => void signOut()}>Chiqish</button></Centered>;
  if (!me) return <div className="loading"><LoaderCircle className="spin"/> Profil tekshirilmoqda…</div>;

  const staff = me.staff;
  const isAdmin = me.user.isAdmin;
  const approved = staff?.status === "approved";

  if (!isAdmin) {
    if (!staff || editing) {
      return <ApplicationForm email={me.user.email} existing={staff} demo={demo} onSaved={() => { setEditing(false); void load(); }} onSignOut={() => void signOut()}/>;
    }
    if (staff.status === "pending") {
      return <Centered icon={<Clock3 size={36}/>} title="Arizangiz tekshirilmoqda">
        <p>Administrator litsenziya va ish joyingizni tasdiqlagach, bemorlar sizni tanlay oladi. Odatda 1–2 ish kuni.</p>
        <dl className="summary"><dt>F.I.Sh.</dt><dd>{staff.full_name}</dd><dt>Rol</dt><dd>{ROLE_LABELS[staff.role]}</dd><dt>Muassasa</dt><dd>{staff.organization}</dd><dt>Litsenziya</dt><dd>{staff.license_number}</dd></dl>
        {demo && <p className="muted tiny">Demo: admin hisobiga kirib (admin@demo.inhayat.uz) bu arizani tasdiqlashingiz mumkin.</p>}
        <div className="row-actions"><button className="link-button" onClick={() => void load()}>Holatni yangilash</button><button className="link-button" onClick={() => setEditing(true)}>Arizani tahrirlash</button><button className="link-button" onClick={() => void signOut()}>Chiqish</button></div>
      </Centered>;
    }
    if (staff.status === "rejected" || staff.status === "suspended") {
      return <Centered icon={<ShieldX size={36}/>} title={staff.status === "rejected" ? "Ariza rad etildi" : "Kirish to‘xtatilgan"}>
        {staff.review_note ? <p className="review-note">Administrator izohi: {staff.review_note}</p> : <p>Batafsil ma’lumot uchun administrator bilan bog‘laning.</p>}
        <div className="row-actions">{staff.status === "rejected" && <button className="link-button" onClick={() => setEditing(true)}>Arizani tuzatib qayta yuborish</button>}<button className="link-button" onClick={() => void signOut()}>Chiqish</button></div>
      </Centered>;
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    ...(approved ? [{ id: "patients" as const, label: "Bemorlarim", icon: <Users size={16}/> }] : []),
    ...(isAdmin ? [
      { id: "dashboard" as const, label: "Boshqaruv paneli", icon: <LayoutDashboard size={16}/> },
      { id: "reviews" as const, label: "Xodimlar arizalari", icon: <ShieldCheck size={16}/> },
      { id: "agent" as const, label: "AI Nazoratchi", icon: <Bot size={16}/> },
    ] : []),
  ];
  const active = tab && tabs.some(t => t.id === tab) ? tab : tabs[0].id;

  return (
    <div className="shell">
      <aside className="side">
        <Brand/>
        <div className="me">
          <span className="avatar"><Stethoscope size={16}/></span>
          <div>
            <b>{staff?.full_name || me.user.email}</b>
            <small>{isAdmin ? "Platforma administratori" : `${ROLE_LABELS[staff!.role]} · ${STAFF_STATUS_LABELS[staff!.status]}`}</small>
          </div>
        </div>
        <nav>
          {tabs.map(t => <button key={t.id} className={active === t.id ? "active" : ""} onClick={() => setTab(t.id)}>{t.icon} {t.label}</button>)}
        </nav>
        <button className="signout" onClick={() => void signOut()}><LogOut size={16}/> Chiqish</button>
      </aside>
      <main className="content">
        {demo && <DemoStrip/>}
        {active === "patients" && staff && <DoctorWorkspace staff={staff}/>}
        {active === "dashboard" && <AdminDashboard demo={demo} onOpenAgent={() => setTab("agent")} onOpenReviews={() => setTab("reviews")}/>}
        {active === "reviews" && <AdminReviews/>}
        {active === "agent" && <AgentConsole/>}
      </main>
    </div>
  );
}
