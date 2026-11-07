// Pure helpers (no browser / Supabase imports) so they can be unit-tested.
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("998")) return `+${digits.slice(0, 12)}`;
  if (digits.length === 9) return `+998${digits}`;
  return `+${digits}`;
}

export function isValidPhone(phone: string): boolean {
  return /^\+998\d{9}$/.test(phone);
}

/**
 * Supabase phone login needs a paid SMS provider. Until one is configured,
 * a phone number is mapped to a stable internal e-mail and used with
 * Supabase's normal password auth (passwords are hashed by Supabase).
 */
export function phoneToInternalEmail(cleanPhone: string): string {
  return `user_${cleanPhone.replace(/\D/g, "")}@inhayat.uz`;
}
