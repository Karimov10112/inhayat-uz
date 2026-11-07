import { createClient } from "@supabase/supabase-js";

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
// Blank or placeholder values mean "not configured" -> the portal runs in demo mode.
const url = rawUrl && /^https:\/\/\S+$/.test(rawUrl) ? rawUrl : "";
const key = rawKey && rawKey.length > 20 ? rawKey : "";

// storageKey differs from the patient site so both can be open in one browser.
export const supabase = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "inhayat-pro-auth" },
}) : null;

export function requireSupabase() {
  if (!supabase) throw new Error("Supabase sozlanmagan.");
  return supabase;
}
