// Pure URL helpers. Never log or persist callback tokens.
export const AUTH_DESTINATION_KEY = 'lifebridge.auth.destination';
// Stored only for the short cross-origin OAuth round-trip. It contains no
// credentials and lets us recover when Supabase clears the callback URL first.
export const AUTH_PENDING_KEY = 'lifebridge.auth.pending';
export const RECOVERY_KEY = 'lifebridge.auth.recovery';
const authKeys = ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token', 'expires_at', 'expires_in', 'token_type', 'error', 'error_code', 'error_description'];

export function inspectAuthReturn(href: string) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const fragment = authKeys.some(key => hash.has(key));
  return {
    present: fragment || url.searchParams.has('code') || url.searchParams.has('error'),
    recovery: hash.get('type') === 'recovery' || url.searchParams.get('type') === 'recovery',
    hasCode: url.searchParams.has('code'),
    hasError: hash.has('error') || hash.has('error_description') || url.searchParams.has('error'),
    pathname: url.pathname,
  };
}

export function cleanAuthReturn(href: string) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  if (authKeys.some(key => hash.has(key))) url.hash = '';
  for (const key of [...authKeys, 'code']) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function authDestination(preferred: string | null, recovery = false) {
  if (recovery) return '/reset-password';
  return preferred === '/admin' ? '/admin' : '/cabinet';
}

export function authRedirectUrl(origin: string, destination: string) {
  return new URL(destination === '/reset-password' ? destination : authDestination(destination), origin).href;
}
