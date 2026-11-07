"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { RECOVERY_KEY } from "../../lib/auth-redirect";
export default function ResetPassword() {
  const [password, setPassword] = useState(''); const [ready, setReady] = useState(false); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY' && active) setReady(true); });
    supabase.auth.getSession().then(({ data }) => {
      try { if (active && data.session && sessionStorage.getItem(RECOVERY_KEY) === '1') setReady(true); } catch { /* The auth event handles storage-disabled browsers. */ }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  async function save(e: FormEvent) { e.preventDefault(); if (!supabase || !ready || busy) return; setBusy(true); const { error } = await supabase.auth.updateUser({ password }); setBusy(false); if (error) setMessage('Parolni yangilab bo‘lmadi. Yangi tiklash havolasini so‘rang.'); else { setMessage('Parol yangilandi. Kabinetga o‘tishingiz mumkin.'); setReady(false); } }
  return <main className="auth-page reset-page"><section className="auth-card"><h1>Yangi parol</h1><p>Emailingizdagi tiklash havolasi orqali ushbu sahifani oching.</p><form onSubmit={save}><label>Yangi parol<input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Kamida 8 belgi"/></label><button disabled={!ready || busy}>Parolni saqlash</button></form><p role="status">{message}</p><Link href="/cabinet">Kabinetga qaytish →</Link></section></main>;
}
