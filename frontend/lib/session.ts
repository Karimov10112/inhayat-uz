"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * One auth/session layer for both data modes:
 *  - demo:     the backend issues a signed token, kept in localStorage
 *  - supabase: Supabase Auth issues the JWT; the backend verifies it
 * Every data call goes to the backend API, which picks the matching store.
 */

const TOKEN_KEY = "inhayat_demo_token";
const EVENT = "inhayat-auth-change";

export type DemoAccount = { phone?: string; email?: string; password: string; label: string };
export type BackendConfig = { mode: "demo" | "supabase"; storage: string; ai: string; demoAccounts: Record<string, DemoAccount> | null };

let configPromise: Promise<BackendConfig> | null = null;
export function getConfig(): Promise<BackendConfig> {
  if (!configPromise) {
    configPromise = fetch("/api/config", { cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error("backend"); return r.json(); })
      .catch(error => { configPromise = null; throw error; });
  }
  return configPromise;
}

function readDemoToken() {
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setDemoToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}

export async function getAccessToken(): Promise<string | null> {
  const config = await getConfig();
  if (config.mode === "demo") return readDemoToken();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Calls the backend with the current user's token. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new ApiError(401, "Hisobingizga qayta kiring.");
  const response = await fetch(path, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: { authorization: `Bearer ${token}`, ...(init.body !== undefined ? { "content-type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    const config = await getConfig().catch(() => null);
    if (config?.mode === "demo") setDemoToken(null);
  }
  if (!response.ok) throw new ApiError(response.status, typeof data.error === "string" ? data.error : "Server bilan bog‘lanib bo‘lmadi.");
  return data as T;
}

export async function signOut() {
  const config = await getConfig().catch(() => null);
  if (config?.mode === "supabase" && supabase) await supabase.auth.signOut().catch(() => {});
  setDemoToken(null);
  try {
    // Leftovers from older browser-only versions.
    ["lifebridge_session", "inhayat_users_v1", "inhayat_local_cases", "inhayat_local_profile"].forEach(k => window.localStorage.removeItem(k));
  } catch { /* ignore */ }
}

export type AuthState =
  | { status: "loading" }
  | { status: "backend_down" }
  | { status: "misconfigured"; config: BackendConfig }
  | { status: "signed_out"; config: BackendConfig }
  | { status: "signed_in"; config: BackendConfig; token: string };

/** React hook: current auth state, re-evaluated on login/logout. */
export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    const evaluate = async () => {
      let config: BackendConfig;
      try { config = await getConfig(); } catch { if (alive) setState({ status: "backend_down" }); return; }
      if (config.mode === "supabase" && !supabase) { if (alive) setState({ status: "misconfigured", config }); return; }
      const token = await getAccessToken();
      if (alive) setState(token ? { status: "signed_in", config, token } : { status: "signed_out", config });
    };
    void evaluate();
    const onChange = () => void evaluate();
    window.addEventListener(EVENT, onChange);
    const sub = supabase?.auth.onAuthStateChange(() => onChange());
    return () => { alive = false; window.removeEventListener(EVENT, onChange); sub?.data.subscription.unsubscribe(); };
  }, []);
  return state;
}

async function demoAuth(path: string, body: object) {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Server bilan bog‘lanib bo‘lmadi.");
  setDemoToken(data.token);
}
export const demoLogin = (body: { phone?: string; email?: string; password: string }) => demoAuth("/api/auth/demo/login", body);
export const demoRegister = (body: { phone?: string; email?: string; password: string }) => demoAuth("/api/auth/demo/register", body);
