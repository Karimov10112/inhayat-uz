import { randomUUID } from "node:crypto";
import { hashPassword } from "../auth.js";
import type { DemoDb } from "./demo-repo.js";

/** Demo accounts shown on the login screens (demo mode only). */
export const DEMO_ACCOUNTS = {
  patient: { phone: "+998901234567", password: "Demo12345", label: "Bemor — Yusupova Malika" },
  doctor: { email: "doktor@demo.inhayat.uz", password: "Demo123456", label: "Shifokor — Karimov Anvar" },
  pendingDoctor: { email: "yangi@demo.inhayat.uz", password: "Demo123456", label: "Tekshiruvdagi xodim" },
  admin: { email: "admin@demo.inhayat.uz", password: "Demo123456", label: "Platforma administratori" },
};

const ago = (days: number, hours = 0) => new Date(Date.now() - days * 864e5 - hours * 36e5).toISOString();

/** A tiny but valid one-page PDF so "Open document" works in the demo. */
export function demoPdf(title: string): Buffer {
  const text = `DEMO: ${title} - haqiqiy tibbiy hujjat emas`.replace(/[()\\]/g, "").replace(/[^\x20-\x7E]/g, "'");
  const stream = `BT /F1 14 Tf 60 760 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

export function seedDemoData(db: DemoDb): { key: string; content: Buffer }[] {
  const files: { key: string; content: Buffer }[] = [];
  const user = (email: string, phone: string, password: string, isAdmin = false, days = 20) => {
    const id = randomUUID();
    db.users.push({ id, email, phone, password_hash: hashPassword(password), is_admin: isAdmin, created_at: ago(days) });
    return id;
  };

  // Staff and admin
  const admin = user(DEMO_ACCOUNTS.admin.email, "", DEMO_ACCOUNTS.admin.password, true, 30);
  const doctor = user(DEMO_ACCOUNTS.doctor.email, "", DEMO_ACCOUNTS.doctor.password);
  const haem = user("gematolog@demo.inhayat.uz", "", "Demo123456");
  const pending = user(DEMO_ACCOUNTS.pendingDoctor.email, "", DEMO_ACCOUNTS.pendingDoctor.password, false, 1);
  const staffRow = (id: string, full_name: string, role: "doctor" | "coordinator", speciality: string, organization: string, region: string, status: "approved" | "pending", license: string, days: number) =>
    db.staff.push({ id, full_name, role, speciality, license_number: license, organization, region, phone: "+998712345678", status, review_note: "", reviewed_by: status === "approved" ? admin : null, reviewed_at: status === "approved" ? ago(days - 1) : null, created_at: ago(days), updated_at: ago(days) });
  staffRow(doctor, "Karimov Anvar Rustamovich", "doctor", "Nefrolog-transplantolog", "Respublika ixtisoslashtirilgan nefrologiya va buyrak transplantatsiyasi markazi", "Toshkent shahri", "approved", "SSV-04-112233", 18);
  staffRow(haem, "Nazarova Dilnoza Baxtiyorovna", "doctor", "Gematolog", "Respublika ixtisoslashtirilgan gematologiya ilmiy-amaliy tibbiyot markazi", "Toshkent shahri", "approved", "SSV-01-558210", 15);
  staffRow(pending, "Ergashev Sardor Olimovich", "coordinator", "Transplant koordinatori", "Samarqand viloyat ko‘p tarmoqli tibbiyot markazi", "Samarqand", "pending", "KOORD-7781", 1);
  db.reviews.push({ at: ago(17), admin_id: admin, staff_name: "Karimov Anvar Rustamovich", status: "approved" }, { at: ago(14), admin_id: admin, staff_name: "Nazarova Dilnoza Baxtiyorovna", status: "approved" });

  // Patients
  const patient = (phone: string, password: string, name: string, region: string, days: number) => {
    const id = user("", phone, password, false, days);
    db.profiles.push({ id, full_name: name, phone, region });
    return id;
  };
  const malika = patient(DEMO_ACCOUNTS.patient.phone, DEMO_ACCOUNTS.patient.password, "Yusupova Malika", "Samarqand", 12);
  const bobur = patient("+998935556677", "Demo12345", "Rahimov Bobur", "Buxoro", 8);
  const ilhom = patient("+998977771122", "Demo12345", "Toshmatov Ilhom", "Andijon", 10);

  const newCase = (patientId: string, pathway: "kidney" | "liver" | "stem_cell", region: string, status: DemoDb["cases"][number]["status"], days: number, updatedDays: number) => {
    const id = randomUUID();
    db.cases.push({ id, patient_id: patientId, transplant_pathway: pathway, status, preferred_region: region, created_at: ago(days), updated_at: ago(updatedDays) });
    return id;
  };
  const doc = (caseId: string, patientId: string, kind: DemoDb["documents"][number]["kind"], name: string, days: number) => {
    const key = `patients/${patientId}/${randomUUID()}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const content = demoPdf(name);
    files.push({ key, content });
    const id = randomUUID();
    db.documents.push({ id, case_id: caseId, patient_id: patientId, kind, object_key: key, original_name: name, mime_type: "application/pdf", bytes: content.length, uploaded_at: ago(days) });
    return id;
  };
  const note = (caseId: string, authorId: string, name: string, staff: boolean, kind: DemoDb["notes"][number]["kind"], body: string, days: number, hours = 0) =>
    db.notes.push({ id: randomUUID(), case_id: caseId, author_id: authorId, author_name: name, author_is_staff: staff, kind, body, created_at: ago(days, hours) });
  const share = (caseId: string, patientId: string, staffId: string, days: number) =>
    db.shares.push({ id: randomUUID(), case_id: caseId, patient_id: patientId, staff_id: staffId, active: true, created_at: ago(days), revoked_at: null });

  // 1) Malika — kidney, actively reviewed by Dr Karimov
  const c1 = newCase(malika, "kidney", "Samarqand", "under_review", 11, 1);
  const d1 = doc(c1, malika, "lab_result", "Kreatinin_va_mochevina.pdf", 9);
  doc(c1, malika, "imaging", "Buyrak_UZI_xulosasi.pdf", 9);
  doc(c1, malika, "referral", "Viloyat_yollanmasi.pdf", 8);
  db.checklist[c1] = ["clinic", "consultation", "documents"];
  share(c1, malika, doctor, 8);
  note(c1, malika, "Yusupova Malika", false, "message", "Assalomu alaykum, doktor. Oxirgi tahlillarimni yukladim. Navbatdagi qadam nima?", 8, 2);
  note(c1, doctor, "Karimov Anvar Rustamovich", true, "status", "under_review", 7);
  note(c1, doctor, "Karimov Anvar Rustamovich", true, "document_request", "Iltimos, umumiy qon tahlili va HLA tiplash natijasini ham yuklang.", 7);
  note(c1, malika, "Yusupova Malika", false, "message", "HLA tiplashni qayerda topshirsam bo‘ladi?", 1, 5);
  db.access.push({ id: randomUUID(), document_id: d1, document_name: "Kreatinin_va_mochevina.pdf", case_id: c1, viewer_id: doctor, viewer_name: "Karimov Anvar Rustamovich", viewed_at: ago(7, 1) });

  // 2) Bobur — liver, shared, waiting for an answer for 3 days (agent should flag it)
  const c2 = newCase(bobur, "liver", "Buxoro", "documents_pending", 7, 3);
  doc(c2, bobur, "lab_result", "Jigar_funksional_testlari.pdf", 6);
  db.checklist[c2] = ["clinic"];
  share(c2, bobur, doctor, 5);
  note(c2, bobur, "Rahimov Bobur", false, "message", "Doktor, jigar testlarim yuklandi. Qo‘shimcha nima kerak bo‘ladi?", 3);

  // 3) Ilhom — stem cell, never shared, inactive for 9 days (agent should flag it)
  newCase(ilhom, "stem_cell", "Andijon", "draft", 10, 9);

  return files;
}
