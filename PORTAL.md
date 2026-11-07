# InHayat Pro — shifokorlar portali

Bemorlar sayti (`frontend/`, `inhayat.uz`) bilan bitta Supabase bazasini ishlatadigan alohida sayt (`portal/`, masalan `pro.inhayat.uz`). U shifokorlar, klinika koordinatorlari va platforma administratorlari uchun.

## Qanday ishlaydi

```
Shifokor ro'yxatdan o'tadi ──► Ariza "Tekshiruvda"
                                   │
              Admin tasdiqlaydi ◄──┘   (litsenziya va ish joyi tekshiriladi)
                    │
                    ▼
Bemor kabinetida tasdiqlangan shifokorni tanlaydi ──► "Ruxsat berish"
                    │
                    ▼
Shifokor: hujjatlarni ochadi · xulosa yozadi · hujjat so'raydi · holatni o'zgartiradi
                    │
                    ▼
Bemor kabinetida: xabarlar, holat va "kim hujjatimni ochgan" ro'yxati
```

| Rol | Qayerda | Nima qila oladi |
|---|---|---|
| Bemor | `inhayat.uz/cabinet` | Yo‘l xaritasi, hujjat yuklash, shifokorga ruxsat berish/bekor qilish, yozishma |
| Shifokor / koordinator | `pro.inhayat.uz` | Faqat ruxsat bergan bemorlarni ko‘radi, xulosa va so‘rov yozadi, holatni o‘zgartiradi |
| Platforma admini | `pro.inhayat.uz` | Xodimlar arizalarini tasdiqlaydi, rad etadi, to‘xtatadi |
| Katalog admini | `inhayat.uz/admin` | Markaz va klinikalar katalogini tahrirlaydi (avvalgidek) |

### Xavfsizlik bazada ta’minlanadi (RLS)

- Shifokor bemor ma’lumotini **faqat** quyidagi ikki shart bajarilganda ko‘radi: (1) uning arizasi `approved`, (2) bemor aynan shu yo‘l xaritasini unga ulashgan. Bemor ruxsatni bekor qilsa, kirish darhol yopiladi.
- Xodim o‘zini o‘zi tasdiqlay olmaydi. Arizani tahrirlasa, u qayta `pending` holatiga o‘tadi va qayta tekshiriladi.
- Shifokor bemor yo‘l xaritasini to‘g‘ridan-to‘g‘ri tahrirlay olmaydi, faqat `set_case_status` funksiyasi orqali holatni o‘zgartiradi. Har bir o‘zgarish yozishmada qayd etiladi.
- Shifokor hujjatni backend orqali, 5 daqiqalik havola bilan ochadi. Har bir ochilish `document_access_log` jadvaliga yoziladi va bemorga ko‘rsatiladi. Qayd yozilmasa, hujjat ochilmaydi.
- Xodim xabarga boshqa ism yoza olmaydi: muallif ismi baza tomonidan tekshiriladi.

Bu qoidalar mahalliy PostgreSQL 16 da Supabase’ga o‘xshatilgan muhitda ssenariylar bilan sinab ko‘rilgan: o‘zini tasdiqlash, tasdiqlanmagan shifokorga ulashish, begona yo‘l xaritasi, ruxsat bekor qilingandan keyingi kirish va soxta muallif ismi.

## O‘rnatish

### 1. Baza

> Demo uchun bu bo‘limdagi hech narsa kerak emas — README’dagi “Demo” qismini ko‘ring.


Supabase SQL Editor’da `backend/supabase/004_provider_portal.sql` va `005_admin_agent.sql` fayllarini ishga tushiring. Undan oldin `schema.sql`, `002` va `003` qo‘llangan bo‘lishi kerak. Faylni qayta ishga tushirish xavfsiz.

### 2. Bemorlar uchun telefon orqali kirish

Bemorlar telefon raqami va parol bilan kiradi (ichkarida `user_998…@inhayat.internal` ko‘rinishidagi email sifatida saqlanadi). Bu ishlashi uchun **Supabase → Authentication → Sign In / Providers → Email → “Confirm email”** sozlamasini o‘chiring, aks holda yangi bemor kira olmaydi.

> Bu sozlama butun loyihaga ta’sir qiladi: shifokorlar ham emailni tasdiqlamasdan kira oladi. Portalda bunga qarshi himoya bor — har bir xodimni admin qo‘lda tasdiqlaydi. Kelajakda SMS provayder (masalan, Eskiz.uz) ulansa, bemorlar uchun haqiqiy SMS-kodga o‘tib, email tasdiqlashni qayta yoqish tavsiya etiladi.

### 3. Platforma admini

Admin avval portalda oddiy hisob ochadi. So‘ng loyiha egasi Supabase SQL Editor’da quyidagini bajaradi:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email = 'admin@sizning-domen.uz';
```

Shundan keyin admin chiqib, qayta kirishi kerak.

### 4. Lokal ishga tushirish

```bash
npm install
npm install --prefix frontend
npm install --prefix portal
npm install --prefix backend
cp portal/.env.example portal/.env.local   # Supabase qiymatlarini kiriting
npm run dev:all
```

- Bemorlar sayti: http://localhost:3000
- Portal: http://localhost:3001
- Backend: http://localhost:4000/health

### 5. Production (Vercel)

1. Vercel’da **ikkinchi loyiha** yarating: shu GitHub repo, *Root Directory* = `portal`.
2. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `BACKEND_INTERNAL_URL`.
3. Domen: `pro.inhayat.uz`, DNS’da CNAME yozuvi qo‘shiladi.
4. Backend’da: `FRONTEND_ORIGIN=https://www.inhayat.uz,https://pro.inhayat.uz`.
5. Supabase → URL Configuration → Redirect URLs ro‘yxatiga `https://pro.inhayat.uz` qo‘shing (emailni tasdiqlash va parolni tiklash havolalari uchun).
6. R2 bucket CORS sozlamasiga ikkala domenni ham qo‘shing.

## Keyingi bosqich uchun g‘oyalar

- **Klinika admini roli:** koordinator o‘z muassasasidagi shifokorlarni o‘zi tasdiqlaydi (DMED’dagi muassasa kabineti kabi).
- **Bemorni muassasaga ulashish:** bitta shifokorga emas, butun jamoaga ruxsat berish.
- **Bildirishnomalar:** shifokor xabar yozganda bemorga SMS yoki Telegram orqali xabar borishi.
- **Qabulga yozilish:** shifokor bo‘sh vaqtlarini belgilaydi, bemor tanlaydi.
- **Navbat va kutish ro‘yxati:** markazlar uchun (rasmiy integratsiyasiz uni “jonli” deb e’lon qilmang).
- **Tarjima:** portal hozircha faqat o‘zbek tilida; rus tili qo‘shilishi kerak.
