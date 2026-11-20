import { isValidPhone, normalizePhone } from "./phone";
import { demoLogin, demoRegister, signOut } from "./session";

export { isValidPhone, normalizePhone };

// The backend keeps accounts (hashed passwords) in its local demo store.

export async function registerWithPhone(rawPhone: string, password: string): Promise<void> {
  const cleanPhone = normalizePhone(rawPhone);
  if (!isValidPhone(cleanPhone)) throw new Error("INVALID_PHONE");
  if (!password || password.length < 8) throw new Error("INVALID_PASSWORD");
  return demoRegister({ phone: cleanPhone, password });
}

export async function loginWithPhone(rawPhone: string, password: string): Promise<void> {
  const cleanPhone = normalizePhone(rawPhone);
  if (!isValidPhone(cleanPhone)) throw new Error("INVALID_PHONE");
  if (!password) throw new Error("INVALID_CREDENTIALS");
  return demoLogin({ phone: cleanPhone, password });
}

export const signOutUser = signOut;
