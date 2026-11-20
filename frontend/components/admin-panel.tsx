"use client";

import Link from "next/link";

export function AdminPanel() {
  return (
    <main className="access-denied">
      <h1>Katalog boshqaruvi o‘chirilgan</h1>
      <p>Bu topshiriladigan lokal nusxada tashqi katalog bazasi va API ulanishlari mavjud emas.</p>
      <Link className="primary-button" href="/cabinet">Kabinetga qaytish</Link>
    </main>
  );
}
