import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Used only in demo mode. In Supabase mode, Supabase issues and verifies tokens.
const SECRET = process.env.DEMO_SECRET || randomBytes(32).toString("hex");

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function sign(payload: string) {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

/** Compact signed token: base64url(json).signature */
export function issueToken(data: Record<string, unknown>, ttlSeconds: number): string {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readToken<T extends Record<string, unknown>>(token: string): T | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp: number };
    if (typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}
