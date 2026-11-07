"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, EyeOff, FlaskConical, HeartPulse, LoaderCircle, LockKeyhole, Phone, ShieldCheck } from "lucide-react";
import { SitePreferencesControls, useSitePreferences } from "./site-preferences";
import { loginWithPhone, registerWithPhone, normalizePhone } from "../lib/auth-service";
import { demoLogin, getConfig, type DemoAccount } from "../lib/session";

export function AuthPanel({ admin = false }: { admin?: boolean }) {
  const { strings } = useSitePreferences();
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("+998");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const destination = admin ? "/admin" : "/cabinet";
  const [demoAccount, setDemoAccount] = useState<DemoAccount | null>(null);

  useEffect(() => {
    getConfig().then(config => setDemoAccount(config.demoAccounts?.patient ?? null)).catch(() => {});
  }, []);

  async function enterDemo() {
    if (!demoAccount || busy) return;
    setBusy(true); setError("");
    try {
      await demoLogin({ phone: demoAccount.phone, password: demoAccount.password });
      router.push(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "register") {
        setMode("register");
      }
    }
  }, []);

  function handlePhoneChange(val: string) {
    // Only allow plus and digits
    let cleaned = val.replace(/[^\d+]/g, "");
    if (!cleaned.startsWith("+")) {
      cleaned = "+" + cleaned.replace(/\+/g, "");
    }
    // Limit to max 13 chars (+998XXXXXXXXX)
    if (cleaned.length > 13) {
      cleaned = cleaned.slice(0, 13);
    }
    setPhone(cleaned);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    setError("");
    setMessage("");

    const normalized = normalizePhone(phone);
    if (!/^\+998\d{9}$/.test(normalized)) {
      setError(strings.auth_err_phone_format || "Telefon raqamini to‘liq kiriting (+998901234567).");
      return;
    }

    if (mode === "register" && password.length < 8) {
      setError(strings.auth_err_password_len || "Parol kamida 8 ta belgidan iborat bo‘lishi kerak.");
      return;
    }

    setBusy(true);

    try {
      if (mode === "register") {
        await registerWithPhone(normalized, password);
        setMessage(strings.auth_success_registered || "Muvaffaqiyatli ro‘yxatdan o‘tdingiz! Kabinetga yo‘naltirilmoqda...");
        setTimeout(() => {
          router.push(destination);
        }, 800);
      } else {
        await loginWithPhone(normalized, password);
        router.push(destination);
      }
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      if (errMessage === "ALREADY_EXISTS") {
        setError(strings.auth_err_already_exists || "Bu telefon raqami allaqachon ro‘yxatdan o‘tgan. Iltimos, kirish bo‘limidan kiring.");
      } else if (errMessage === "INVALID_CREDENTIALS") {
        setError(strings.auth_err_invalid_credentials || "Telefon raqami yoki parol noto‘g‘ri.");
      } else if (errMessage === "INVALID_PASSWORD") {
        setError(strings.auth_err_password_len || "Parol kamida 8 ta belgidan iborat bo‘lishi kerak.");
      } else if (errMessage === "CONFIRMATION_REQUIRED") {
        setError(strings.auth_err_confirmation);
      } else if (errMessage === "INVALID_PHONE") {
        setError(strings.auth_err_phone_format || "Telefon raqamini to‘liq kiriting (+998901234567).");
      } else {
        setError(errMessage || "Ulanishda xatolik yuz berdi. Qayta urinib ko‘ring.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <header className="auth-top">
        <Link href="/" className="brand">
          <span className="brand-mark"><HeartPulse size={20} /></span>
          <span>Life<span>Bridge</span></span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <SitePreferencesControls />
          <Link href="/" className="back"><ArrowLeft size={16} /> {strings.auth_back}</Link>
        </div>
      </header>

      <div className="auth-grid">
        <section className="auth-intro">
          <div className="eyebrow light">{admin ? "LifeBridge boshqaruvi" : strings.hero_all_in_one}</div>
          <h1>{admin ? "Tartibli ma’lumot. Ishonchli yordam." : strings.hero_doctor_title}</h1>
          <p>{strings.hero_desc}</p>
          <div className="auth-benefits">
            <span><ShieldCheck size={18} /> {strings.auth_benefits_1}</span>
            <span><LockKeyhole size={18} /> {strings.auth_benefits_2}</span>
            <span><Phone size={18} /> {strings.auth_benefits_3}</span>
          </div>
        </section>

        <section className="auth-card auth-v2">
          <div className="auth-tabs">
            <button
              type="button"
              onClick={() => { setMode("login"); setError(""); setMessage(""); }}
              className={mode === "login" ? "selected" : ""}
            >
              {strings.auth_login}
            </button>
            <button
              type="button"
              onClick={() => { setMode("register"); setError(""); setMessage(""); }}
              className={mode === "register" ? "selected" : ""}
            >
              {strings.auth_register}
            </button>
          </div>

          <h2>
            {admin
              ? "Boshqaruv paneli"
              : mode === "login"
              ? strings.auth_welcome_back
              : strings.auth_create_account}
          </h2>
          <p>
            {mode === "login"
              ? (strings.hero_doctor_sub || "Har qadamda tushunarli yo‘l")
              : (strings.start_desc || "Hudud, yo‘nalish va mavjud hujjatlaringizni belgilang.")}
          </p>

          <form onSubmit={submit} style={{ marginTop: "24px" }}>
            <label>
              {strings.auth_phone || "Telefon raqam"}
              <div style={{ position: "relative", display: "flex", alignItems: "center", marginTop: "6px" }}>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  autoComplete="tel"
                  required
                  placeholder="+998 90 123 45 67"
                  style={{ width: "100%", fontSize: "16px", letterSpacing: "0.5px" }}
                />
              </div>
            </label>

            <label style={{ marginTop: "16px" }}>
              {strings.auth_password || "Parol"}
              <div className="password-input" style={{ marginTop: "6px" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={mode === "register" ? 8 : 1}
                  required
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  placeholder={
                    mode === "register"
                      ? "8 xonali maxfiy parol"
                      : "••••••••"
                  }
                  style={{ width: "100%", fontSize: "16px" }}
                />
                <button
                  type="button"
                  aria-label="Parolni ko'rsatish yoki yashirish"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {mode === "register" && (
                <small style={{ display: "block", marginTop: "4px", color: "var(--muted, #64748b)", fontSize: "12px" }}>
                  * Parol kamida 8 ta belgidan iborat bo‘lishi lozim
                </small>
              )}
            </label>

            <button
              className="auth-submit"
              disabled={busy}
              style={{ marginTop: "20px" }}
            >
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : mode === "register" ? (
                strings.auth_submit_register || "Ro‘yxatdan o‘tish"
              ) : (
                strings.auth_submit_login || "Kirish"
              )}
              <ArrowRight size={17} />
            </button>
          </form>

          {error && <p className="form-error" role="alert" style={{ marginTop: "14px" }}>{error}</p>}
          {demoAccount && !admin && (
            <div className="demo-quick">
              <span className="demo-quick-icon"><FlaskConical size={18}/></span>
              <div>
                <b>{strings.demo_quick_title}</b>
                <p>{strings.demo_quick_desc}</p>
                <small>{demoAccount.phone} · {demoAccount.password}</small>
              </div>
              <button type="button" onClick={() => void enterDemo()} disabled={busy}>{strings.demo_quick_btn} <ArrowRight size={15}/></button>
            </div>
          )}
          {message && <p className="auth-message" role="status" style={{ marginTop: "14px", color: "var(--brand, #0f766e)", fontWeight: 500 }}>{message}</p>}

          <small style={{ marginTop: "20px", display: "flex", alignItems: "center", gap: "6px", color: "var(--muted)" }}>
            <LockKeyhole size={13} /> {strings.auth_secure_note}
          </small>
        </section>
      </div>
    </main>
  );
}
