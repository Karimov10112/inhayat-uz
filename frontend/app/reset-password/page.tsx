"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  function save(e: FormEvent) { e.preventDefault(); setMessage(password.length >= 8 ? 'Lokal demo rejimda parolni tiklash o‘chirilgan.' : 'Kamida 8 belgi kiriting.'); }
  return <main className="auth-page reset-page"><section className="auth-card"><h1>Parolni tiklash o‘chirilgan</h1><p>Bu topshiriladigan lokal nusxada email yoki bulutli autentifikatsiya yo‘q.</p><form onSubmit={save}><label>Yangi parol<input type="password" minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Kamida 8 belgi"/></label><button>Tekshirish</button></form><p role="status">{message}</p><Link href="/cabinet">Kabinetga qaytish →</Link></section></main>;
}
