"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, FileCheck2, FlaskConical, LoaderCircle, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { requireSupabase } from "../lib/supabase";
import { demoLogin, demoRegister, type BackendConfig } from "../lib/session";
import { Brand } from "./portal-app";

const ERRORS: Record<string, string> = {
  ALREADY_EXISTS: "Bu email allaqachon ro‘yxatdan o‘tgan. Kirish bo‘limidan kiring.",
  INVALID_CREDENTIALS: "Email yoki parol noto‘g‘ri.",
  INVALID_EMAIL: "Email manzilini to‘g‘ri kiriting.",
  INVALID_PASSWORD: "Xodimlar uchun parol kamida 10 ta belgidan iborat bo‘lishi kerak.",
};

export function AuthScreen({ config }: { config: BackendConfig }) {
  const demo = config.mode === "demo";
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(""); setMessage("");
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setError(ERRORS.INVALID_EMAIL); return; }
    if (mode === "register" && password.length < 10) { setError(ERRORS.INVALID_PASSWORD); return; }
    setBusy(true);
    try {
      if (demo) {
        if (mode === "forgot") setMessage("Demo rejimda parolni tiklash yo‘q. Tayyor demo hisoblardan foydalaning.");
        else await (mode === "login" ? demoLogin : demoRegister)({ email: cleanEmail, password });
        return;
      }
      const supabase = requireSupabase();
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) setError("Email yoki parol noto‘g‘ri, yoki email hali tasdiqlanmagan.");
      } else if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password, options: { emailRedirectTo: window.location.origin } });
        if (error) setError(error.message.toLowerCase().includes("registered") ? ERRORS.ALREADY_EXISTS : "Hisob yaratilmadi. Qayta urinib ko‘ring.");
        else if (data.user && data.user.identities?.length === 0) setError(ERRORS.ALREADY_EXISTS);
        else if (!data.session) setMessage("Emailingizga tasdiqlash havolasi yuborildi. Havolani ochib, so‘ng kiring va arizani to‘ldiring.");
      } else {
        await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: window.location.origin });
        setMessage("Agar bu email ro‘yxatdan o‘tgan bo‘lsa, parolni tiklash havolasi yuborildi.");
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setError(ERRORS[code] || code || "Server bilan bog‘lanib bo‘lmadi.");
    } finally {
      setBusy(false);
    }
  }

  async function quick(account: { email?: string; password: string }) {
    setBusy(true); setError("");
    try { await demoLogin({ email: account.email, password: account.password }); }
    catch (err) { setError(err instanceof Error ? err.message : "Xatolik"); }
    finally { setBusy(false); }
  }

  const switchMode = (next: typeof mode) => { setMode(next); setError(""); setMessage(""); };
  const accounts = config.demoAccounts;

  return (
    <main className="auth">
      <section className="auth-intro">
        <Brand/>
        <h1>Bemorlar bilan ishlash uchun yagona joy.</h1>
        <p>Transplantatsiyaga tayyorlanayotgan bemorlar sizga o‘z hujjatlari va yo‘l xaritasini ishonch bilan ulashadi. Siz ularni ko‘rib chiqasiz, xulosa yozasiz va keyingi qadamni belgilaysiz.</p>
        <ul>
          <li><ShieldCheck size={18}/> Har bir xodim litsenziya bo‘yicha tekshiriladi</li>
          <li><Users size={18}/> Faqat sizga ruxsat bergan bemorlar ko‘rinadi</li>
          <li><FileCheck2 size={18}/> Har bir hujjat ochilishi bemorga ko‘rsatiladi</li>
        </ul>
        <small>Bemor sifatida kirmoqchimisiz? <a href={`${process.env.NEXT_PUBLIC_PATIENT_SITE_URL || "http://localhost:3000"}/cabinet`}>Bemorlar sayti</a></small>
      </section>
      <section className="card auth-card">
        {demo && accounts && (
          <div className="demo-accounts">
            <div className="demo-accounts-head"><FlaskConical size={15}/> <b>Demo rejim</b> — bir bosishda kiring</div>
            {(["doctor", "admin", "pendingDoctor"] as const).map(key => accounts[key] && (
              <button key={key} type="button" disabled={busy} onClick={() => void quick(accounts[key])}>
                <span><b>{accounts[key].label}</b><small>{accounts[key].email}</small></span><ArrowRight size={15}/>
              </button>
            ))}
          </div>
        )}
        {mode !== "forgot" && (
          <div className="tabs">
            <button type="button" className={mode === "login" ? "selected" : ""} onClick={() => switchMode("login")}>Kirish</button>
            <button type="button" className={mode === "register" ? "selected" : ""} onClick={() => switchMode("register")}>Ro‘yxatdan o‘tish</button>
          </div>
        )}
        <h2>{mode === "login" ? "Xodim sifatida kirish" : mode === "register" ? "Xodim hisobini yaratish" : "Parolni tiklash"}</h2>
        <p className="muted">{mode === "register" ? "Keyingi qadamda mutaxassislik, litsenziya va ish joyingizni kiritasiz." : mode === "forgot" ? "Emailingizga tiklash havolasi yuboramiz." : "Shifokorlar, koordinatorlar va administratorlar uchun."}</p>
        <form onSubmit={submit}>
          <label>Ish emaili
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required placeholder="doktor@klinika.uz"/>
          </label>
          {mode !== "forgot" && (
            <label>Parol
              <span className="password">
                <input type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === "register" ? 10 : 1} autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder={mode === "register" ? "Kamida 10 belgi" : "••••••••••"}/>
                <button type="button" onClick={() => setShow(!show)} aria-label="Parolni ko‘rsatish">{show ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
              </span>
            </label>
          )}
          <button className="primary" disabled={busy}>
            {busy ? <LoaderCircle size={17} className="spin"/> : null}
            {mode === "login" ? "Kirish" : mode === "register" ? "Hisob yaratish" : "Havola yuborish"} <ArrowRight size={16}/>
          </button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
        <div className="auth-links">
          {mode === "forgot" ? <button className="link-button" onClick={() => switchMode("login")}>← Kirishga qaytish</button> : <button className="link-button" onClick={() => switchMode("forgot")}>Parolni unutdingizmi?</button>}
        </div>
        <small className="muted secure"><LockKeyhole size={13}/> Bemor ma’lumotlari faqat uning roziligi bilan ochiladi.</small>
      </section>
    </main>
  );
}

export function NewPasswordForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    if (password.length < 10) { setError("Kamida 10 ta belgi."); return; }
    setBusy(true);
    const { error } = await requireSupabase().auth.updateUser({ password });
    setBusy(false);
    if (error) setError("Parol yangilanmadi. Yangi havola so‘rang."); else onDone();
  }
  return (
    <main className="centered">
      <Brand/>
      <section className="card narrow">
        <h1>Yangi parol</h1>
        <form onSubmit={save}>
          <label>Yangi parol<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={10} required/></label>
          <button className="primary" disabled={busy}>{busy && <LoaderCircle size={16} className="spin"/>} Saqlash</button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
