"use client";

import { SitePreferences } from "./site-preferences";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SitePreferences>{children}</SitePreferences>;
}
