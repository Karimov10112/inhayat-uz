import { createClient, type Session, type AuthError } from "@supabase/supabase-js";
import { inspectAuthReturn } from "./auth-redirect";

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
// Blank or placeholder values mean "not configured" -> the site runs in demo mode.
const url = rawUrl && /^https:\/\/\S+$/.test(rawUrl) ? rawUrl : "";
const key = rawKey && rawKey.length > 20 ? rawKey : "";

// Capture only flags before the SDK consumes and clears the OAuth fragment.
export const initialAuthReturn = typeof window === 'undefined' ? null : inspectAuthReturn(window.location.href);
export const supabase = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

let completion: Promise<{ data: { session: Session | null }; error: AuthError | null }> | null = null;
export function completeAuthReturn() {
  if (!supabase) throw new Error('Authentication is not configured.');
  if (!completion) {
    const code = typeof window !== 'undefined' ? new URL(window.location.href).searchParams.get('code') : null;
    const client = supabase;
    completion = (async () => {
      // Let automatic URL detection finish first, avoiding a duplicate PKCE exchange.
      const result = await client.auth.getSession();
      if (result.data.session || !code) return result;
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      return { data: { session: data.session }, error };
    })();
  }
  return completion!;
}

export function requireSupabase() {
  if (!supabase) throw new Error("Supabase environment variables are not configured.");
  return supabase;
}
