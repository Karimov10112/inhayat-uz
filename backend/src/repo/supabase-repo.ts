import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HttpError,
  type AccessEntry, type ActivityEntry, type Actor, type AgentAuditEntry, type CaseBundle, type CaseOverviewRow, type CaseRow,
  type CaseStatus, type DirectoryEntry, type DocKind, type DocRow, type Note, type NoteKind, type Pathway, type PlatformStats,
  type Profile, type Share, type SharedCaseRow, type StaffInput, type StaffProfile, type StaffStatus,
} from "../types.js";
import type { Repo } from "./repo.js";

/**
 * Supabase implementation. The client carries the user's JWT, so every query
 * is filtered by the row-level security policies in backend/supabase/*.sql.
 * Access checks here are only for friendlier error messages.
 */
export class SupabaseRepo implements Repo {
  constructor(private db: SupabaseClient) {}

  private fail(error: { message: string } | null, message = "Ma’lumotlar bazasi xatosi.") {
    if (error) { console.error("Supabase:", error.message); throw new HttpError(400, message); }
  }

  private toProfile(row: Record<string, unknown> | null, id: string): Profile {
    return { id, full_name: String(row?.full_name ?? ""), phone: String(row?.phone ?? ""), region: String(row?.region ?? "") };
  }

  private toDoc(row: Record<string, unknown>): DocRow {
    return {
      id: row.id as string, case_id: row.case_id as string, patient_id: row.patient_id as string, kind: row.kind as DocKind,
      object_key: row.r2_object_key as string, original_name: row.original_name as string, mime_type: row.mime_type as string,
      bytes: row.bytes as number, uploaded_at: row.uploaded_at as string,
    };
  }

  private async staffName(actor: Actor) {
    const { data } = await this.db.from("staff_profiles").select("full_name, status").eq("id", actor.id).maybeSingle();
    return data?.status === "approved" ? (data.full_name as string) : null;
  }

  // ---------------------------------------------------------------- patient
  async getProfile(actor: Actor) {
    await this.db.from("profiles").upsert({ id: actor.id }, { onConflict: "id", ignoreDuplicates: true });
    const { data, error } = await this.db.from("profiles").select("full_name, phone, region").eq("id", actor.id).maybeSingle();
    this.fail(error);
    return this.toProfile(data, actor.id);
  }

  async updateProfile(actor: Actor, input: { full_name: string; region: string }) {
    const { error } = await this.db.from("profiles").update({ ...input, ...(actor.phone ? { phone: actor.phone } : {}), updated_at: new Date().toISOString() }).eq("id", actor.id);
    this.fail(error, "Profil saqlanmadi.");
    return this.getProfile(actor);
  }

  async listMyCases(actor: Actor) {
    const { data, error } = await this.db.from("cases").select("*").eq("patient_id", actor.id).order("created_at", { ascending: false });
    this.fail(error);
    return (data ?? []).map(r => ({ ...r, preferred_region: r.preferred_region ?? "" })) as CaseRow[];
  }

  async createCase(actor: Actor, input: { pathway: Pathway; region: string }) {
    await this.getProfile(actor);
    const { data, error } = await this.db.from("cases").insert({ patient_id: actor.id, transplant_pathway: input.pathway, preferred_region: input.region }).select("*").single();
    this.fail(error, "Yo‘l xaritasi yaratilmadi.");
    return data as CaseRow;
  }

  async getCaseBundle(actor: Actor, caseId: string): Promise<CaseBundle> {
    const { data: row } = await this.db.from("cases").select("*").eq("id", caseId).maybeSingle();
    if (!row) throw new HttpError(404, "Yo‘l xaritasi topilmadi yoki unga ruxsat yo‘q.");
    const isOwner = row.patient_id === actor.id;
    const [profile, docs, progress, shares, notes, directory, access] = await Promise.all([
      this.db.from("profiles").select("full_name, phone, region").eq("id", row.patient_id).maybeSingle(),
      this.db.from("medical_documents").select("*").eq("case_id", caseId).order("uploaded_at", { ascending: false }),
      this.db.from("preparation_progress").select("completed").eq("case_id", caseId).maybeSingle(),
      this.db.from("case_shares").select("*").eq("case_id", caseId),
      this.db.from("case_notes").select("*").eq("case_id", caseId).order("created_at"),
      this.db.rpc("approved_staff_directory"),
      isOwner
        ? this.db.from("document_access_log").select("id, document_id, viewer_name, viewed_at, medical_documents(original_name)").eq("case_id", caseId).order("viewed_at", { ascending: false }).limit(30)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);
    const byId = new Map(((directory.data ?? []) as DirectoryEntry[]).map(d => [d.id, d]));
    return {
      viewer: isOwner ? "patient" : "staff",
      case: { ...(row as CaseRow), preferred_region: row.preferred_region ?? "" },
      patient: this.toProfile(profile.data, row.patient_id),
      documents: ((docs.data ?? []) as Record<string, unknown>[]).map(d => { const { object_key: _k, ...rest } = this.toDoc(d); return rest; }),
      checklist: (progress.data?.completed as string[] | undefined) ?? [],
      shares: ((shares.data ?? []) as Share[]).map(s => ({ ...s, staff: byId.get(s.staff_id) ?? null })),
      notes: (notes.data ?? []) as Note[],
      accessLog: ((access.data ?? []) as { id: number; document_id: string; viewer_name: string; viewed_at: string; medical_documents: { original_name: string } | null }[])
        .map(a => ({ id: String(a.id), document_id: a.document_id, document_name: a.medical_documents?.original_name ?? "", viewer_name: a.viewer_name, viewed_at: a.viewed_at } satisfies AccessEntry)),
    };
  }

  async setChecklist(actor: Actor, caseId: string, completed: string[]) {
    const { data, error } = await this.db.from("preparation_progress").upsert({ case_id: caseId, patient_id: actor.id, completed }, { onConflict: "case_id" }).select("completed").single();
    this.fail(error, "Ro‘yxat saqlanmadi.");
    return (data?.completed as string[]) ?? completed;
  }

  async addDocument(actor: Actor, input: { caseId: string; kind: DocKind; objectKey: string; originalName: string; mimeType: string; bytes: number }) {
    const { data: owned } = await this.db.from("cases").select("id").eq("id", input.caseId).eq("patient_id", actor.id).maybeSingle();
    if (!owned) throw new HttpError(404, "Yo‘l xaritasi topilmadi.");
    const { error } = await this.db.from("medical_documents").insert({ case_id: input.caseId, patient_id: actor.id, kind: input.kind, r2_object_key: input.objectKey, original_name: input.originalName, mime_type: input.mimeType, bytes: input.bytes });
    this.fail(error, "Hujjat saqlanmadi.");
    await this.db.from("cases").update({ updated_at: new Date().toISOString() }).eq("id", input.caseId);
  }

  async openDocument(actor: Actor, documentId: string) {
    const { data } = await this.db.from("medical_documents").select("*").eq("id", documentId).maybeSingle();
    if (!data) throw new HttpError(404, "Hujjat topilmadi yoki unga ruxsat yo‘q.");
    const doc = this.toDoc(data);
    if (doc.patient_id !== actor.id) {
      const name = await this.staffName(actor);
      const { error } = await this.db.from("document_access_log").insert({ document_id: doc.id, case_id: doc.case_id, viewer_id: actor.id, viewer_name: name ?? "" });
      // No audit record -> no file.
      if (error) throw new HttpError(403, "Kirish qayd etilmadi, hujjat ochilmadi.");
    }
    return doc;
  }

  async staffDirectory() {
    const { data, error } = await this.db.rpc("approved_staff_directory");
    this.fail(error);
    return (data ?? []) as DirectoryEntry[];
  }

  async setShare(actor: Actor, caseId: string, staffId: string, active: boolean) {
    const { error } = active
      ? await this.db.from("case_shares").upsert({ case_id: caseId, patient_id: actor.id, staff_id: staffId, active: true, revoked_at: null }, { onConflict: "case_id,staff_id" })
      : await this.db.from("case_shares").update({ active: false, revoked_at: new Date().toISOString() }).eq("case_id", caseId).eq("staff_id", staffId);
    this.fail(error, "Ruxsat o‘zgarmadi.");
  }

  async addNote(actor: Actor, caseId: string, kind: NoteKind, body: string) {
    const { data: row } = await this.db.from("cases").select("patient_id, status").eq("id", caseId).maybeSingle();
    if (!row) throw new HttpError(404, "Yo‘l xaritasi topilmadi yoki unga ruxsat yo‘q.");
    const isOwner = row.patient_id === actor.id;
    if (isOwner && kind !== "message") throw new HttpError(403, "Bemor faqat xabar yoza oladi.");
    const staffName = isOwner ? "" : await this.staffName(actor);
    if (!isOwner && !staffName) throw new HttpError(403, "Hisobingiz tasdiqlanmagan.");
    const { error } = await this.db.from("case_notes").insert({ case_id: caseId, author_id: actor.id, author_name: staffName ?? "", author_is_staff: !isOwner, kind, body });
    this.fail(error, "Xabar yuborilmadi.");
    if (!isOwner && kind === "document_request" && row.status !== "closed" && row.status !== "documents_pending") {
      await this.db.rpc("set_case_status", { target: caseId, next_status: "documents_pending" });
    }
  }

  // ---------------------------------------------------------------- staff
  async getMyStaff(actor: Actor) {
    const { data, error } = await this.db.from("staff_profiles").select("*").eq("id", actor.id).maybeSingle();
    this.fail(error, "Xodim profili o‘qilmadi. 004-migratsiyani tekshiring.");
    return (data as StaffProfile | null) ?? null;
  }

  async saveMyStaff(actor: Actor, input: StaffInput) {
    const existing = await this.getMyStaff(actor);
    const values = { ...input, status: "pending", updated_at: new Date().toISOString() };
    const { data, error } = existing
      ? await this.db.from("staff_profiles").update(values).eq("id", actor.id).select("*").single()
      : await this.db.from("staff_profiles").insert({ id: actor.id, ...values }).select("*").single();
    this.fail(error, "Ariza saqlanmadi.");
    return data as StaffProfile;
  }

  async listSharedCases(actor: Actor): Promise<SharedCaseRow[]> {
    const { data, error } = await this.db.from("case_shares")
      .select("created_at, cases(*, profiles(full_name, phone, region))")
      .eq("staff_id", actor.id).eq("active", true).order("created_at", { ascending: false });
    this.fail(error, "Bemorlar ro‘yxati yuklanmadi.");
    const rows = ((data ?? []) as unknown as { created_at: string; cases: (CaseRow & { profiles: Record<string, unknown> | null }) | null }[]).filter(r => r.cases);
    const ids = rows.map(r => r.cases!.id);
    const [docs, notes] = ids.length ? await Promise.all([
      this.db.from("medical_documents").select("case_id").in("case_id", ids),
      this.db.from("case_notes").select("case_id, author_is_staff, kind, created_at").in("case_id", ids),
    ]) : [{ data: [] }, { data: [] }];
    return rows.map(r => {
      const { profiles, ...c } = r.cases!;
      const caseNotes = ((notes.data ?? []) as { case_id: string; author_is_staff: boolean; kind: string; created_at: string }[]).filter(n => n.case_id === c.id && n.kind !== "status");
      const last = (staff: boolean) => caseNotes.filter(n => n.author_is_staff === staff).map(n => n.created_at).sort().pop() ?? null;
      return {
        case: { ...c, preferred_region: c.preferred_region ?? "" }, patient: this.toProfile(profiles, c.patient_id), shared_at: r.created_at,
        documents: ((docs.data ?? []) as { case_id: string }[]).filter(d => d.case_id === c.id).length,
        last_patient_message_at: last(false), last_staff_message_at: last(true),
      };
    });
  }

  async setCaseStatus(_actor: Actor, caseId: string, status: CaseStatus) {
    const { error } = await this.db.rpc("set_case_status", { target: caseId, next_status: status });
    if (error) throw new HttpError(404, "Holat o‘zgarmadi. Bemor ruxsatni bekor qilgan bo‘lishi mumkin.");
  }

  // ---------------------------------------------------------------- admin
  private requireAdmin(actor: Actor) { if (!actor.isAdmin) throw new HttpError(403, "Faqat administrator uchun."); }

  async listStaff(actor: Actor) {
    this.requireAdmin(actor);
    const { data, error } = await this.db.from("staff_profiles").select("*").order("created_at", { ascending: false });
    this.fail(error);
    return (data ?? []) as StaffProfile[];
  }

  async reviewStaff(actor: Actor, staffId: string, status: StaffStatus, note: string) {
    this.requireAdmin(actor);
    const { data, error } = await this.db.from("staff_profiles")
      .update({ status, review_note: note, reviewed_by: actor.id, reviewed_at: new Date().toISOString() }).eq("id", staffId).select("*").maybeSingle();
    this.fail(error, "Saqlanmadi.");
    if (!data) throw new HttpError(404, "Xodim topilmadi.");
    await this.db.from("staff_review_log").insert({ admin_id: actor.id, staff_name: data.full_name, status });
    return data as StaffProfile;
  }

  async platformStats(actor: Actor) {
    this.requireAdmin(actor);
    const { data, error } = await this.db.rpc("admin_platform_stats");
    this.fail(error, "Statistika olinmadi. 005-migratsiyani tekshiring.");
    return data as PlatformStats;
  }

  async caseOverview(actor: Actor) {
    this.requireAdmin(actor);
    const { data, error } = await this.db.rpc("admin_case_overview");
    this.fail(error, "Murojaatlar ro‘yxati olinmadi. 005-migratsiyani tekshiring.");
    return ((data ?? []) as CaseOverviewRow[]).map(r => ({ ...r, documents: Number(r.documents), active_shares: Number(r.active_shares) }));
  }

  async recentActivity(actor: Actor, limit: number) {
    this.requireAdmin(actor);
    const { data, error } = await this.db.rpc("admin_recent_activity", { max_rows: limit });
    this.fail(error);
    return (data ?? []) as ActivityEntry[];
  }

  async recordAgentAction(actor: Actor, entry: Omit<AgentAuditEntry, "id" | "at" | "admin_id">) {
    this.requireAdmin(actor);
    await this.db.from("agent_audit").insert({ admin_id: actor.id, ...entry });
  }

  async listAgentActions(actor: Actor, limit: number) {
    this.requireAdmin(actor);
    const { data } = await this.db.from("agent_audit").select("*").order("at", { ascending: false }).limit(limit);
    return (data ?? []) as AgentAuditEntry[];
  }
}
