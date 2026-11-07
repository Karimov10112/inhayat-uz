import type {
  AccessEntry, ActivityEntry, Actor, AgentAuditEntry, CaseBundle, CaseOverviewRow, CaseRow, CaseStatus, DirectoryEntry,
  DocKind, DocRow, NoteKind, Pathway, PlatformStats, Profile, SharedCaseRow, StaffInput, StaffProfile, StaffStatus,
} from "../types.js";

/**
 * Every data operation the product needs. Two implementations:
 *  - DemoRepo: JSON file on the server, rules enforced in code (works with no setup)
 *  - SupabaseRepo: runs as the signed-in user, rules enforced by Postgres RLS
 * Routes and the AI agent only talk to this interface, so switching to Supabase
 * later needs no changes outside the repo layer.
 */
export interface Repo {
  // Patient
  getProfile(actor: Actor): Promise<Profile>;
  updateProfile(actor: Actor, input: { full_name: string; region: string }): Promise<Profile>;
  listMyCases(actor: Actor): Promise<CaseRow[]>;
  createCase(actor: Actor, input: { pathway: Pathway; region: string }): Promise<CaseRow>;
  getCaseBundle(actor: Actor, caseId: string): Promise<CaseBundle>;
  setChecklist(actor: Actor, caseId: string, completed: string[]): Promise<string[]>;
  addDocument(actor: Actor, input: { caseId: string; kind: DocKind; objectKey: string; originalName: string; mimeType: string; bytes: number }): Promise<void>;
  /** Returns the document if the actor may see it; records staff access. */
  openDocument(actor: Actor, documentId: string): Promise<DocRow>;
  staffDirectory(actor: Actor): Promise<DirectoryEntry[]>;
  setShare(actor: Actor, caseId: string, staffId: string, active: boolean): Promise<void>;
  addNote(actor: Actor, caseId: string, kind: NoteKind, body: string): Promise<void>;

  // Staff
  getMyStaff(actor: Actor): Promise<StaffProfile | null>;
  saveMyStaff(actor: Actor, input: StaffInput): Promise<StaffProfile>;
  listSharedCases(actor: Actor): Promise<SharedCaseRow[]>;
  setCaseStatus(actor: Actor, caseId: string, status: CaseStatus): Promise<void>;

  // Admin (also used by the AI agent, always on behalf of an admin)
  listStaff(actor: Actor): Promise<StaffProfile[]>;
  reviewStaff(actor: Actor, staffId: string, status: StaffStatus, note: string): Promise<StaffProfile>;
  platformStats(actor: Actor): Promise<PlatformStats>;
  caseOverview(actor: Actor): Promise<CaseOverviewRow[]>;
  recentActivity(actor: Actor, limit: number): Promise<ActivityEntry[]>;
  recordAgentAction(actor: Actor, entry: Omit<AgentAuditEntry, "id" | "at" | "admin_id">): Promise<void>;
  listAgentActions(actor: Actor, limit: number): Promise<AgentAuditEntry[]>;
}

export type { AccessEntry };
