# AI agent "Nazoratchi"

Platforma administratori uchun AI yordamchi. Portaldagi **AI Nazoratchi** bo‘limida chat ko‘rinishida ishlaydi. Kodi `backend/src/agent/` papkasida.

## Nima qila oladi

| Tool | Nima qiladi | Tasdiq kerakmi |
|---|---|---|
| `scan_for_issues` | Saytni tekshiradi: javobsiz bemorlar, kutib qolgan arizalar, harakatsiz murojaatlar, tizim sozlamalari | Yo‘q |
| `get_platform_stats` | Umumiy statistika | Yo‘q |
| `list_cases` | Murojaatlar ro‘yxati (holat va harakatsizlik bo‘yicha filtr bilan) | Yo‘q |
| `list_staff_applications` | Xodimlar arizalari | Yo‘q |
| `review_staff_application` | Arizani tasdiqlash, rad etish yoki to‘xtatish | **Ha** |
| `recent_activity` | So‘nggi hodisalar | Yo‘q |
| `system_health` | Texnik holat (rejim, fayl ombori, AI, xotira) | Yo‘q |
| `agent_action_log` | Agent bajargan amallar jurnali | Yo‘q |

**Xavfsizlik qoidalari:**
- Agent faqat **admin** hisobi bilan ishlaydi. Admin bo‘lmagan foydalanuvchi so‘rov yuborsa, backend 403 xatosini qaytaradi.
- Agent faqat **metama’lumotni** ko‘radi: holatlar, sonlar va vaqtlar. Tibbiy hujjatlar va xabar matnlari unga berilmaydi.
- Ma’lumotni o‘zgartiradigan tool darhol bajarilmaydi. U ekranda "Tasdiq kerak" kartasi bo‘lib chiqadi va admin tugmani bosgandan keyin bajariladi. Har bir tasdiq faqat bir marta ishlatiladi va 15 daqiqadan keyin eskiradi.
- Agent ishlatgan har bir tool audit jurnaliga yoziladi: demo rejimda `agent` ro‘yxatiga, Supabase rejimida `agent_audit` jadvaliga.
- Agent toollari sayt ishlatadigan `Repo` orqali ishlaydi, shuning uchun saytdagi barcha ruxsat qoidalari agentga ham amal qiladi.

## AI modelni ulash

Kalitni `backend/.env` fayliga qo‘shing va backendni qayta ishga tushiring:

```env
# Claude (Anthropic)
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5-5

# yoki OpenAI'ga mos istalgan API (OpenAI, OpenRouter, Groq, Azure, lokal LLM...)
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1

# Ikkalasi ham bo‘lsa, qaysi birini ishlatishni tanlang:
AI_PROVIDER=anthropic
```

Kalit qo‘shilmagan bo‘lsa, agent **oflayn rejimda** ishlaydi. Bu rejimda u kalit so‘zlarga qarab kerakli toolni o‘zi tanlaydi ("muammolarni tekshir", "statistika", "arizalar", "murojaatlar", "faoliyat", "tizim holati"). Ma’lumotni o‘zgartiradigan amallarni oflayn rejim bajarmaydi.

## O‘z toolingizni qo‘shish

`backend/src/agent/tools.ts` faylidagi `TOOLS` massiviga yangi obyekt qo‘shasiz:

```ts
{
  name: "send_sms_reminder",
  description: "Bemorga SMS eslatma yuboradi (Eskiz.uz).",
  input_schema: {
    type: "object",
    properties: {
      case_id: { type: "string" },
      text: { type: "string", description: "SMS matni, 160 belgigacha" },
    },
    required: ["case_id", "text"],
  },
  requiresApproval: true,                       // tashqi amal -> admin tasdiqlaydi
  describe: input => `SMS: “${String(input.text).slice(0, 60)}”`,
  run: async (ctx, input) => {
    // ctx.repo — ma’lumotlar (ruxsatlar bilan), ctx.actor — admin
    const res = await fetch("https://notify.eskiz.uz/api/message/sms/send", { /* ... */ });
    return { ok: res.ok };
  },
},
```

Bundan boshqa hech narsa qilish shart emas: tool modelga avtomatik ko‘rsatiladi, chat'da ishlaydi va audit jurnaliga yoziladi. Yana qo‘shish mumkin bo‘lgan toollarga misollar:
- Telegram orqali shifokorga eslatma yuborish
- Supabase/R2 holatini tekshirish
- Kunlik hisobotni email qilish

## Avtomatik kuzatuv

`scan_for_issues` qoidalari `backend/src/agent/monitor.ts` faylida. Chegaralar `RULES` obyektida:

```ts
export const RULES = {
  staffPendingHours: 24,        // ariza shuncha soatdan ko‘p kutsa
  unansweredPatientHours: 48,   // bemor xabariga shuncha soat javob bo‘lmasa
  idleDraftDays: 7,             // ulashilmagan murojaat shuncha kun harakatsiz qolsa
  noDocumentsDays: 3,           // hujjat yuklanmagan bo‘lsa
  longReviewDays: 14,           // "ko‘rib chiqilmoqda" holati cho‘zilsa
};
```

Bu monitor AI kalitisiz ham ishlaydi. Boshqaruv panelidagi "Ogohlantirishlar" bo‘limi shu yerdan olinadi.

## API

| Endpoint | Tavsif |
|---|---|
| `POST /api/agent/chat` | `{ messages }` → `{ messages, pendingActions }` |
| `POST /api/agent/actions/:id` | `{ approve: true \| false }` — kutilayotgan amal bo‘yicha qaror |
| `GET /api/agent/audit` | Oxirgi 50 ta agent amali |
| `GET /api/admin/dashboard` | Statistika, ogohlantirishlar, faoliyat, murojaatlar |

Testlar `backend/test/api.test.ts` faylida. Ular oflayn agentni, Claude so‘rov formatini, OpenAI formatini va tasdiqlash oqimini tekshiradi.
