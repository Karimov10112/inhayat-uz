import { requireSupabase } from "./supabase";
import { isValidPhone, normalizePhone, phoneToInternalEmail } from "./phone";
import { demoLogin, demoRegister, getConfig, signOut } from "./session";

export { isValidPhone, normalizePhone };

// Demo mode: the backend keeps accounts (hashed passwords) in its demo store.
// Supabase mode: phone -> internal e-mail + Supabase password auth.

export async function registerWithPhone(rawPhone: string, password: string): Promise<void> {
  const cleanPhone = normalizePhone(rawPhone);
  if (!isValidPhone(cleanPhone)) throw new Error("INVALID_PHONE");
  if (!password || password.length < 8) throw new Error("INVALID_PASSWORD");
  if ((await getConfig()).mode === "demo") return demoRegister({ phone: cleanPhone, password });

  const supabase = requireSupabase();
  const email = phoneToInternalEmail(cleanPhone);
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { phone: cleanPhone, full_name: "" } } });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("unique") || error.status === 422) throw new Error("ALREADY_EXISTS");
    throw new Error(error.message);
  }
  if (data.user && data.user.identities?.length === 0) throw new Error("ALREADY_EXISTS");
  if (data.session) return;
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.data.session) return;
  throw new Error("CONFIRMATION_REQUIRED");
}

export async function loginWithPhone(rawPhone: string, password: string): Promise<void> {
  const cleanPhone = normalizePhone(rawPhone);
  if (!isValidPhone(cleanPhone)) throw new Error("INVALID_PHONE");
  if (!password) throw new Error("INVALID_CREDENTIALS");
  if ((await getConfig()).mode === "demo") return demoLogin({ phone: cleanPhone, password });
  const { data, error } = await requireSupabase().auth.signInWithPassword({ email: phoneToInternalEmail(cleanPhone), password });
  if (error || !data.session) throw new Error("INVALID_CREDENTIALS");
}

export const signOutUser = signOut;
