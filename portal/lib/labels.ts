export const PATHWAY_LABELS: Record<string, string> = {
  kidney: "Buyrak transplantatsiyasi",
  liver: "Jigar transplantatsiyasi",
  heart: "Yurak transplantatsiyasi",
  stem_cell: "O‘zak hujayra transplantatsiyasi",
  other: "Boshqa yo‘nalish",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Qoralama",
  documents_pending: "Hujjatlar kutilmoqda",
  under_review: "Ko‘rib chiqilmoqda",
  centre_contacted: "Markaz bilan bog‘lanildi",
  closed: "Yopilgan",
};
export const STATUS_ORDER = ["draft", "documents_pending", "under_review", "centre_contacted", "closed"];

export const DOC_KIND_LABELS: Record<string, string> = {
  lab_result: "Tahlil natijasi",
  imaging: "Tasvir",
  referral: "Yo‘llanma",
  identity: "Shaxs hujjati",
  other: "Boshqa",
};

export const CHECKLIST_LABELS: Record<string, string> = {
  clinic: "Hududiy klinika bilan kelishilgan",
  consultation: "Kerakli tahlillar aniqlangan",
  documents: "Hujjatlar yuklangan",
  centre: "Markaz bilan bog‘langan",
  travel: "Safar rejasi kelishilgan",
};

export const ROLE_LABELS: Record<string, string> = { doctor: "Shifokor", coordinator: "Klinika koordinatori" };

export const STAFF_STATUS_LABELS: Record<string, string> = {
  pending: "Tekshiruvda",
  approved: "Tasdiqlangan",
  rejected: "Rad etilgan",
  suspended: "To‘xtatilgan",
};

export const REGIONS = ["Andijon", "Buxoro", "Farg‘ona", "Jizzax", "Qashqadaryo", "Namangan", "Navoiy", "Qoraqalpog‘iston R.", "Samarqand", "Sirdaryo", "Surxondaryo", "Toshkent shahri", "Toshkent viloyati", "Xorazm"];

export function formatDate(value: string, withTime = true) {
  return new Date(value).toLocaleString("uz-UZ", withTime
    ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit", year: "numeric" });
}
