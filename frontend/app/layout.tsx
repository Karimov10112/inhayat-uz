import type { Metadata } from "next";
import "./globals.css";
import "./product-updates.css";
import "./mvp.css";
import "./map.css";
import "./shortlist.css";
import "./collab.css";
import { AuthReturn } from "../components/auth-return";
import { Providers } from "../components/providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.inhayat.uz"),
  title: { default: "LifeBridge — transplantatsiyaga tayyorgarlik", template: "%s | LifeBridge" },
  description: "O‘zbekiston hududlaridagi klinikalarni toping, transplantatsiyaga tayyorgarlik hujjatlarini tartiblang va Toshkentga safar byudjetini rejalashtiring.",
  verification: { google: "9l1nnHtpVDI9FnD1Mg1_zhdx0CwuuAbNO1WugyJG5Bc" },
  openGraph: { type: "website", locale: "uz_UZ", siteName: "LifeBridge", title: "LifeBridge — tayyorgarlikdan tiklanishgacha", description: "Hududiy klinikalar, shaxsiy yo‘l xaritasi va safar rejasi." },
  twitter: { card: "summary", title: "LifeBridge — transplantatsiyaga tayyorgarlik" }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uz">
      <body>
        <Providers>
          <AuthReturn />
          {children}
        </Providers>
      </body>
    </html>
  );
}
