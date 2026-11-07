import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "InHayat Pro — shifokorlar portali", template: "%s | InHayat Pro" },
  description: "Transplantatsiyaga tayyorlanayotgan bemorlar bilan ishlash uchun shifokorlar va klinika koordinatorlari portali.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="uz"><body>{children}</body></html>;
}
