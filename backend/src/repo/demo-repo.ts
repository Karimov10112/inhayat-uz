import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { hashPassword, verifyPassword } from "../auth.js";
import {
  CASE_STATUSES, CHECKLIST_KEYS, HttpError,
  type AccessEntry, type ActivityEntry, type Actor, type AgentAuditEntry, type CaseBundle, type CaseOverviewRow, type CaseRow,
  type CaseStatus, type DirectoryEntry, type DocKind, type DocRow, type Note, type NoteKind, type Pathway, type PlatformStats,
  type Profile, type Share, type SharedCaseRow, type StaffInput, type StaffProfile, type StaffStatus,
} from "../types.js";
import type { Repo } from "./repo.js";
import { seedDemoData } from "./demo-seed.js";

export interface DemoUser { id: string; email: string; phone: string; password_hash: string; is_admin: boolean; created_at: string }

export interface DemoDb {
  version: 1;
  users: DemoUser[];
  profiles: Profile[];
  cases: CaseRow[];
  documents: DocRow[];
  checklist: Record<string, string[]>;
  staff: StaffProfile[];
  shares: Share[];
  notes: Note[];
  access: (AccessEntry & { case_id: string; viewer_id: string })[];
  reviews: { at: string; admin_id: string; staff_name: string; status: StaffStatus }[];
  agent: AgentAuditEntry[];
}

export function emptyDb(): DemoDb {
  return { version: 1, users: [], profiles: [], cases: [], documents: [], checklist: {}, staff: [], shares: [], notes: [], access: [], reviews: [], agent: [] };
}

const now = () => new Date().toISOString();

/**
 * Demo data store: a single JSON file. Access rules mirror the Supabase RLS
 * policies in backend/supabase/004_provider_portal.sql.
 */
export class DemoRepo implements Repo {
  private db: DemoDb;
  private saveTimer: NodeJS.Timeout | null = null;

  /** @param writeSeedFile stores the sample documents created by the seed */
  constructor(private file: string | null, private writeSeedFile: (key: string, content: Buffer) => void = () => {}) {
    if (file && existsSync(file)) {
      this.db = JSON.parse(readFileSync(file, "utf8")) as DemoDb;
    } else {
      this.db = emptyDb();
      seedDemoData(this.db).forEach(f => this.writeSeedFile(f.key, f.content));
      this.persist(true);
    }
  }

  reset() {
    this.db = emptyDb();
    seedDemoData(this.db).forEach(f => this.writeSeedFile(f.key, f.content));
    this.persist(true);
  }

  /** Coalesces writes; the file is replaced atomically. */
  private persist(immediate = false) {
    if (!this.file) return;
    const write = () => {
      this.saveTimer = null;
      mkdirSync(dirname(this.file!), { recursive: true });
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.db, null, 1));
      renameSync(`${this.file}.tmp`, this.file!);
    };
    if (immediate) { if (this.saveTimer) clearTimeout(this.saveTimer); write(); return; }
    if (!this.saveTimer) this.saveTimer = setTimeout(write, 150);
  }
  flush() { if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; this.persist(true); } }

  // ---------------------------------------------------------------- demo auth
  findUserByLogin(login: { email?: string; phone?: string }) {
    return this.db.users.find(u => (login.email && u.email === login.email) || (login.phone && u.phone === login.phone)) || null;
  }
  getUser(id: string) { return this.db.users.find(u => u.id === id) || null; }

  register(login: { email?: string; phone?: string }, password: string): DemoUser {
    if (this.findUserByLogin(login)) throw new HttpError(409, "ALREADY_EXISTS");
    const user: DemoUser = { id: randomUUID(), email: login.email || "", phone: login.phone || "", password_hash: hashPassword(password), is_admin: false, created_at: now() };
    this.db.users.push(user);
    this.db.profiles.push({ id: user.id, full_name: "", phone: user.phone, region: "" });
    this.persist();
    return user;
  }

  login(login: { email?: string; phone?: string }, password: string): DemoUser {
    const user = this.findUserByLogin(login);
    if (!user || !verifyPassword(password, user.password_hash)) throw new HttpError(401, "INVALID_CREDENTIALS");
    return user;
  }

  // ---------------------------------------------------------------- helpers
  private profileOf(id: string): Profile {
    let profile = this.db.profiles.find(p => p.id === id);
    if (!profile) {
      const user = this.getUser(id);
      profile = { id, full_name: "", phone: user?.phone || "", region: "" };
      this.db.profiles.push(profile);
    }
    return profile;
  }
  private approvedStaff(id: string) { return this.db.staff.find(s => s.id === id && s.status === "approved") || null; }
  private findCase(caseId: string) { return this.db.cases.find(c => c.id === caseId) || null; }
  private ownCase(actor: Actor, caseId: string) {
    const found = this.findCase(caseId);
    return found && found.patient_id === actor.id ? found : null;
  }
  private staffCanAccess(actor: Actor, caseId: string) {
    return !!this.approvedStaff(actor.id) && this.db.shares.some(s => s.case_id === caseId && s.staff_id === actor.id && s.active);
  }
  private requireAdmin(actor: Actor) { if (!actor.isAdmin) throw new HttpError(403, "Faqat administrator uchun."); }
  private directoryEntry(s: StaffProfile): DirectoryEntry {
    return { id: s.id, full_name: s.full_name, role: s.role, speciality: s.speciality, organization: s.organization, region: s.region };
  }
  private touchCase(caseId: string) { const c = this.findCase(caseId); if (c) c.updated_at = now(); }

  // ---------------------------------------------------------------- patient
  async getProfile(actor: Actor) { return { ...this.profileOf(actor.id) }; }

  async updateProfile(actor: Actor, input: { full_name: string; region: string }) {
    const profile = this.profileOf(actor.id);
    profile.full_name = input.full_name;
    profile.region = input.region;
    if (!profile.phone && actor.phone) profile.phone = actor.phone;
    this.persist();
    return { ...profile };
  }

  async listMyCases(actor: Actor) {
    return this.db.cases.filter(c => c.patient_id === actor.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async createCase(actor: Actor, input: { pathway: Pathway; region: string }) {
    if (this.db.cases.filter(c => c.patient_id === actor.id).length >= 10) throw new HttpError(400, "Yo‘l xaritalari soni chegarasiga yetildi.");
    const row: CaseRow = { id: randomUUID(), patient_id: actor.id, transplant_pathway: input.pathway, status: "draft", preferred_region: input.region, created_at: now(), updated_at: now() };
    this.db.cases.push(row);
    this.persist();
    return row;
  }

  async getCaseBundle(actor: Actor, caseId: string): Promise<CaseBundle> {
    const row = this.findCase(caseId);
    const isOwner = row?.patient_id === actor.id;
    if (!row || (!isOwner && !this.staffCanAccess(actor, caseId))) throw new HttpError(404, "Yo‘l xaritasi topilmadi yoki unga ruxsat yo‘q.");
    const shares = this.db.shares.filter(s => s.case_id === caseId && (isOwner || s.staff_id === actor.id)).map(s => {
      const staff = this.db.staff.find(x => x.id === s.staff_id);
      return { ...s, staff: staff ? this.directoryEntry(staff) : null };
    });
    return {
      viewer: isOwner ? "patient" : "staff",
      case: { ...row },
      patient: { ...this.profileOf(row.patient_id) },
      documents: this.db.documents.filter(d => d.case_id === caseId).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)).map(({ object_key: _key, ...rest }) => rest),
      checklist: [...(this.db.checklist[caseId] || [])],
      shares,
      notes: this.db.notes.filter(n => n.case_id === caseId).sort((a, b) => a.created_at.localeCompare(b.created_at)),
      accessLog: isOwner ? this.db.access.filter(a => a.case_id === caseId).sort((a, b) => b.viewed_at.localeCompare(a.viewed_at)).slice(0, 30)
        .map(({ id, document_id, document_name, viewer_name, viewed_at }) => ({ id, document_id, document_name, viewer_name, viewed_at })) : [],
    };
  }

  async setChecklist(actor: Actor, caseId: string, completed: string[]) {
    if (!this.ownCase(actor, caseId)) throw new HttpError(404, "Yo‘l xaritasi topilmadi.");
    const clean = [...new Set(completed.filter(k => (CHECKLIST_KEYS as readonly string[]).includes(k)))];
    this.db.checklist[caseId] = clean;
    this.persist();
    return clean;
  }

  async addDocument(actor: Actor, input: { caseId: string; kind: DocKind; objectKey: string; originalName: string; mimeType: string; bytes: number }) {
    const row = this.ownCase(actor, input.caseId);
    if (!row) throw new HttpError(404, "Yo‘l xaritasi topilmadi.");
    this.db.documents.push({ id: randomUUID(), case_id: input.caseId, patient_id: actor.id, kind: input.kind, object_key: input.objectKey, original_name: input.originalName, mime_type: input.mimeType, bytes: input.bytes, uploaded_at: now() });
    row.updated_at = now();
    this.persist();
  }

  async openDocument(actor: Actor, documentId: string) {
    const doc = this.db.documents.find(d => d.id === documentId);
    if (!doc) throw new HttpError(404, "Hujjat topilmadi yoki unga ruxsat yo‘q.");
    if (doc.patient_id === actor.id) return { ...doc };
    if (!this.staffCanAccess(actor, doc.case_id)) throw new HttpError(404, "Hujjat topilmadi yoki unga ruxsat yo‘q.");
    this.db.access.push({ id: randomUUID(), document_id: doc.id, document_name: doc.original_name, case_id: doc.case_id, viewer_id: actor.id, viewer_name: this.approvedStaff(actor.id)!.full_name, viewed_at: now() });
    this.persist();
    return { ...doc };
  }

  async staffDirectory() {
    return this.db.staff.filter(s => s.status === "approved").sort((a, b) => a.full_name.localeCompare(b.full_name)).map(s => this.directoryEntry(s));
  }

  async setShare(actor: Actor, caseId: string, staffId: string, active: boolean) {
    if (!this.ownCase(actor, caseId)) throw new HttpError(404, "Yo‘l xaritasi topilmadi.");
    if (active && !this.approvedStaff(staffId)) throw new HttpError(400, "Bu shifokor tasdiqlanmagan.");
    const existing = this.db.shares.find(s => s.case_id === caseId && s.staff_id === staffId);
    if (existing) { existing.active = active; existing.revoked_at = active ? null : now(); if (active) existing.created_at = now(); }
    else if (active) this.db.shares.push({ id: randomUUID(), case_id: caseId, patient_id: actor.id, staff_id: staffId, active: true, created_at: now(), revoked_at: null });
    this.persist();
  }

  async addNote(actor: Actor, caseId: string, kind: NoteKind, body: string) {
    const row = this.findCase(caseId);
    if (!row) throw new HttpError(404, "Yo‘l xaritasi topilmadi.");
    if (row.patient_id === actor.id) {
      if (kind !== "message") throw new HttpError(403, "Bemor faqat xabar yoza oladi.");
      this.db.notes.push({ id: randomUUID(), case_id: caseId, author_id: actor.id, author_name: this.profileOf(actor.id).full_name, author_is_staff: false, kind, body, created_at: now() });
    } else if (this.staffCanAccess(actor, caseId)) {
      if (kind === "status") throw new HttpError(400, "Noto‘g‘ri xabar turi.");
      this.db.notes.push({ id: randomUUID(), case_id: caseId, author_id: actor.id, author_name: this.approvedStaff(actor.id)!.full_name, author_is_staff: true, kind, body, created_at: now() });
      if (kind === "document_request" && row.status !== "closed") row.status = "documents_pending";
    } else {
      throw new HttpError(404, "Yo‘l xaritasi topilmadi yoki unga ruxsat yo‘q.");
    }
    this.touchCase(caseId);
    this.persist();
  }

  // ---------------------------------------------------------------- staff
  async getMyStaff(actor: Actor) { const s = this.db.staff.find(x => x.id === actor.id); return s ? { ...s } : null; }

  async saveMyStaff(actor: Actor, input: StaffInput) {
    let row = this.db.staff.find(s => s.id === actor.id);
    if (!row) {
      row = { id: actor.id, ...input, status: "pending", review_note: "", reviewed_by: null, reviewed_at: null, created_at: now(), updated_at: now() };
      this.db.staff.push(row);
    } else {
      // Any self-edit goes back to review, like the Supabase policy.
      Object.assign(row, input, { status: "pending", updated_at: now() });
    }
    this.persist();
    return { ...row };
  }

  async listSharedCases(actor: Actor): Promise<SharedCaseRow[]> {
    if (!this.approvedStaff(actor.id)) throw new HttpError(403, "Hisobingiz hali tasdiqlanmagan.");
    return this.db.shares.filter(s => s.staff_id === actor.id && s.active).flatMap(s => {
      const row = this.findCase(s.case_id);
      if (!row) return [];
      const notes = this.db.notes.filter(n => n.case_id === row.id);
      const last = (staff: boolean) => notes.filter(n => n.author_is_staff === staff && n.kind !== "status").map(n => n.created_at).sort().pop() || null;
      return [{ case: { ...row }, patient: { ...this.profileOf(row.patient_id) }, shared_at: s.created_at, documents: this.db.documents.filter(d => d.case_id === row.id).length, last_patient_message_at: last(false), last_staff_message_at: last(true) }];
    }).sort((a, b) => b.shared_at.localeCompare(a.shared_at));
  }

  async setCaseStatus(actor: Actor, caseId: string, status: CaseStatus) {
    if (!CASE_STATUSES.includes(status)) throw new HttpError(400, "Noto‘g‘ri holat.");
    if (!this.staffCanAccess(actor, caseId)) throw new HttpError(404, "Yo‘l xaritasi topilmadi yoki unga ruxsat yo‘q.");
    const row = this.findCase(caseId)!;
    row.status = status; row.updated_at = now();
    this.db.notes.push({ id: randomUUID(), case_id: caseId, author_id: actor.id, author_name: this.approvedStaff(actor.id)!.full_name, author_is_staff: true, kind: "status", body: status, created_at: now() });
    this.persist();
  }

  // ---------------------------------------------------------------- admin
  async listStaff(actor: Actor) {
    this.requireAdmin(actor);
    return [...this.db.staff].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async reviewStaff(actor: Actor, staffId: string, status: StaffStatus, note: string) {
    this.requireAdmin(actor);
    const row = this.db.staff.find(s => s.id === staffId);
    if (!row) throw new HttpError(404, "Xodim topilmadi.");
    Object.assign(row, { status, review_note: note, reviewed_by: actor.id, reviewed_at: now(), updated_at: now() });
    this.db.reviews.push({ at: now(), admin_id: actor.id, staff_name: row.full_name, status });
    this.persist();
    return { ...row };
  }

  async platformStats(actor: Actor): Promise<PlatformStats> {
    this.requireAdmin(actor);
    const count = <T>(rows: T[], key: (r: T) => string) => rows.reduce<Record<string, number>>((acc, r) => { acc[key(r)] = (acc[key(r)] || 0) + 1; return acc; }, {});
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const staffIds = new Set(this.db.staff.map(s => s.id));
    return {
      patients: new Set(this.db.cases.map(c => c.patient_id)).size || this.db.users.filter(u => !u.is_admin && !staffIds.has(u.id)).length,
      cases: this.db.cases.length,
      cases_by_status: count(this.db.cases, c => c.status),
      documents: this.db.documents.length,
      staff_by_status: count(this.db.staff, s => s.status),
      active_shares: this.db.shares.filter(s => s.active).length,
      notes_last_7_days: this.db.notes.filter(n => n.created_at >= weekAgo).length,
    };
  }

  async caseOverview(actor: Actor): Promise<CaseOverviewRow[]> {
    this.requireAdmin(actor);
    return this.db.cases.map(c => {
      const notes = this.db.notes.filter(n => n.case_id === c.id && n.kind !== "status");
      const last = (staff: boolean) => notes.filter(n => n.author_is_staff === staff).map(n => n.created_at).sort().pop() || null;
      return {
        case_id: c.id, patient_name: this.profileOf(c.patient_id).full_name || "—", region: c.preferred_region, pathway: c.transplant_pathway,
        status: c.status, created_at: c.created_at, updated_at: c.updated_at,
        documents: this.db.documents.filter(d => d.case_id === c.id).length,
        active_shares: this.db.shares.filter(s => s.case_id === c.id && s.active).length,
        last_patient_message_at: last(false), last_staff_message_at: last(true),
      };
    }).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async recentActivity(actor: Actor, limit: number): Promise<ActivityEntry[]> {
    this.requireAdmin(actor);
    const kindLabel: Record<string, string> = { message: "xabar", document_request: "hujjat so‘rovi", conclusion: "xulosa", status: "holat o‘zgarishi" };
    const entries: ActivityEntry[] = [
      ...this.db.cases.map(c => ({ at: c.created_at, kind: "case_created", actor: this.profileOf(c.patient_id).full_name || "Bemor", detail: "yangi yo‘l xaritasi" })),
      ...this.db.documents.map(d => ({ at: d.uploaded_at, kind: "document_uploaded", actor: this.profileOf(d.patient_id).full_name || "Bemor", detail: "hujjat yukladi" })),
      ...this.db.notes.map(n => ({ at: n.created_at, kind: `note_${n.kind}`, actor: n.author_name || "Bemor", detail: kindLabel[n.kind] })),
      ...this.db.access.map(a => ({ at: a.viewed_at, kind: "document_viewed", actor: a.viewer_name, detail: "hujjatni ochdi" })),
      ...this.db.staff.map(s => ({ at: s.created_at, kind: "staff_applied", actor: s.full_name, detail: "xodim arizasi yubordi" })),
      ...this.db.reviews.map(r => ({ at: r.at, kind: "staff_reviewed", actor: "Administrator", detail: `${r.staff_name}: ${r.status}` })),
    ];
    return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }

  async recordAgentAction(actor: Actor, entry: Omit<AgentAuditEntry, "id" | "at" | "admin_id">) {
    this.requireAdmin(actor);
    this.db.agent.push({ id: randomUUID(), at: now(), admin_id: actor.id, ...entry });
    if (this.db.agent.length > 500) this.db.agent.splice(0, this.db.agent.length - 500);
    this.persist();
  }

  async listAgentActions(actor: Actor, limit: number) {
    this.requireAdmin(actor);
    return [...this.db.agent].reverse().slice(0, limit);
  }
}
