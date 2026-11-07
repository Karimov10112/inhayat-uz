import type { CaseOverviewRow, StaffProfile } from "../types.js";

export type AlertLevel = "critical" | "warning" | "info";
export interface Alert {
  id: string; level: AlertLevel; title: string; detail: string; suggestion: string;
  case_id?: string; staff_id?: string;
}

const HOUR = 36e5;
const age = (iso: string | null, nowMs: number) => (iso ? (nowMs - new Date(iso).getTime()) / HOUR : Infinity);
const days = (hours: number) => `${Math.floor(hours / 24)} kun`;

/** Thresholds are deliberately simple and can be tuned in one place. */
export const RULES = {
  staffPendingHours: 24,
  unansweredPatientHours: 48,
  idleDraftDays: 7,
  noDocumentsDays: 3,
  longReviewDays: 14,
};

/**
 * Rule-based site monitor. Uses metadata only (statuses, counts, timestamps),
 * so it never reads message text or medical files. Runs without any AI key.
 */
export function scanPlatform(cases: CaseOverviewRow[], staff: StaffProfile[], context: { mode: string; storage: string; aiProvider: string }, nowMs = Date.now()): Alert[] {
  const alerts: Alert[] = [];

  for (const s of staff.filter(x => x.status === "pending")) {
    const hours = age(s.created_at, nowMs);
    if (hours >= RULES.staffPendingHours) {
      alerts.push({ id: `staff-pending-${s.id}`, level: "warning", staff_id: s.id, title: "Xodim arizasi kutib qolgan", detail: `${s.full_name} (${s.organization}) arizasi ${days(hours)}dan beri tekshirilmagan.`, suggestion: "Litsenziyani tekshirib, arizani tasdiqlang yoki rad eting." });
    }
  }

  for (const c of cases) {
    if (c.status === "closed") continue;
    const who = `${c.patient_name} (${c.region || "hudud yo‘q"})`;
    const patientWaiting = c.last_patient_message_at && (!c.last_staff_message_at || c.last_staff_message_at < c.last_patient_message_at);
    const waitHours = age(c.last_patient_message_at, nowMs);
    if (c.active_shares > 0 && patientWaiting && waitHours >= RULES.unansweredPatientHours) {
      alerts.push({ id: `unanswered-${c.case_id}`, level: waitHours >= 96 ? "critical" : "warning", case_id: c.case_id, title: "Bemor javob kutmoqda", detail: `${who} xabariga ${days(waitHours)}dan beri shifokor javob bermagan.`, suggestion: "Biriktirilgan shifokorga eslatma yuboring yoki boshqa shifokorni taklif qiling." });
    }
    if (c.active_shares === 0 && age(c.updated_at, nowMs) >= RULES.idleDraftDays * 24) {
      alerts.push({ id: `idle-${c.case_id}`, level: "info", case_id: c.case_id, title: "Murojaat harakatsiz", detail: `${who} ${days(age(c.updated_at, nowMs))}dan beri faol emas va hech bir shifokorga ulashilmagan.`, suggestion: "Bemorga shifokor tanlash bo‘yicha yordam taklif qiling." });
    }
    if (c.documents === 0 && age(c.created_at, nowMs) >= RULES.noDocumentsDays * 24) {
      alerts.push({ id: `nodocs-${c.case_id}`, level: "info", case_id: c.case_id, title: "Hujjat yuklanmagan", detail: `${who} yo‘l xaritasini ${days(age(c.created_at, nowMs))} oldin ochgan, lekin hujjat yuklamagan.`, suggestion: "Qaysi tahlillar kerakligi haqida eslatma yuborish mumkin." });
    }
    if (c.status === "under_review" && age(c.updated_at, nowMs) >= RULES.longReviewDays * 24) {
      alerts.push({ id: `longreview-${c.case_id}`, level: "warning", case_id: c.case_id, title: "Ko‘rib chiqish cho‘zilib ketdi", detail: `${who} ${days(age(c.updated_at, nowMs))}dan beri “ko‘rib chiqilmoqda” holatida.`, suggestion: "Shifokordan holatni yangilashni so‘rang." });
    }
  }

  if (context.mode === "demo") alerts.push({ id: "demo-mode", level: "info", title: "Demo rejim", detail: "Ma’lumotlar serverdagi demo faylda saqlanmoqda. Haqiqiy bemor ma’lumotlarini kiritmang.", suggestion: "Ishga tushirishdan oldin Supabase va R2 kalitlarini ulang." });
  if (context.storage === "local" && context.mode !== "demo") alerts.push({ id: "local-storage", level: "critical", title: "Fayllar serverda saqlanmoqda", detail: "R2 sozlanmagan — tibbiy fayllar server diskida.", suggestion: "R2_* o‘zgaruvchilarini sozlang." });
  if (context.aiProvider === "offline") alerts.push({ id: "ai-offline", level: "info", title: "AI model ulanmagan", detail: "Agent oddiy (qoidaga asoslangan) rejimda ishlayapti.", suggestion: "ANTHROPIC_API_KEY yoki OPENAI_API_KEY qo‘shing." });

  const order: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}
