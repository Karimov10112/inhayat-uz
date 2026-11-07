"use client";
import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { completeAuthReturn, supabase } from '../lib/supabase';
import { AUTH_DESTINATION_KEY, AUTH_PENDING_KEY, RECOVERY_KEY, authDestination, cleanAuthReturn, inspectAuthReturn } from '../lib/auth-redirect';

export function AuthReturn() {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    // Read the callback only after the browser is hydrated. Module-level values
    // can otherwise be produced during SSR and miss the browser URL fragment.
    const callback = inspectAuthReturn(window.location.href);
    let oauthWasPending = false;
    try { oauthWasPending = sessionStorage.getItem(AUTH_PENDING_KEY) === '1'; } catch { /* Storage may be unavailable. */ }
    // Supabase can exchange a PKCE code and remove it before this React effect
    // starts. The pending marker keeps that successful return distinguishable
    // from an ordinary visit to the landing page.
    if (!callback.present && !oauthWasPending) return;
    let active = true;
    setPending(true);
    async function finish() {
      let preferred: string | null = null;
      try { preferred = sessionStorage.getItem(AUTH_DESTINATION_KEY); } catch { /* Storage may be unavailable. */ }
      const target = authDestination(callback.pathname === '/admin' ? '/admin' : preferred, callback.recovery);
      let success = false;
      try {
        if (supabase && !callback.hasError) {
          const { data, error } = await completeAuthReturn();
          success = !error && !!data.session;
        }
      } catch { /* Show a neutral login error without exposing tokens. */ }
      if (!active) return;
      // The SDK has finished reading the callback; remove all credentials from the URL.
      window.history.replaceState(window.history.state, '', cleanAuthReturn(window.location.href));
      try {
        sessionStorage.removeItem(AUTH_DESTINATION_KEY);
        sessionStorage.removeItem(AUTH_PENDING_KEY);
        if (success && callback.recovery) sessionStorage.setItem(RECOVERY_KEY, '1');
      } catch { /* Session still works without storage. */ }
      // A full replace is intentional: this component lives in the root layout,
      // and direct navigation remains reliable even when the landing page has a
      // client hydration warning or a stale callback was returned to `/`.
      if (!success) window.location.replace('/cabinet?auth_error=callback');
      else if (window.location.pathname !== target) window.location.replace(target);
      setPending(false);
    }
    void finish();
    return () => { active = false; };
  }, []);
  if (!pending) return null;
  return <div className="auth-return-overlay" role="status"><LoaderCircle className="spin"/><p>Kabinetga kirish yakunlanmoqda…</p></div>;
}
