// Shared domain types used by both data back-ends (demo JSON store and Supabase).

export type CaseStatus = "draft" | "documents_pending" | "under_review" | "centre_contacted" | "closed";
export const CASE_STATUSES: CaseStatus[] = ["draft", "documents_pending", "under_review", "centre_contacted", "closed"];
export type Pathway = "kidney" | "liver" | "heart" | "stem_cell" | "other";
export const PATHWAYS: Pathway[] = ["kidney", "liver", "heart", "stem_cell", "other"];
export type DocKind = "lab_result" | "imaging" | "referral" | "identity" | "other";
export const DOC_KINDS: DocKind[] = ["lab_result", "imaging", "referral", "identity", "other"];
export type NoteKind = "message" | "document_request" | "conclusion" | "status";
export type StaffRole = "doctor" | "coordinator";
export type StaffStatus = "pending" | "approved" | "rejected" | "suspended";
export const CHECKLIST_KEYS = ["clinic", "consultation", "documents", "centre", "travel"] as const;

/** The signed-in user making a request. */
export interface Actor {
  id: string;
  isAdmin: boolean;
  email: string;
  phone: string;
}

export interface Profile { id: string; full_name: string; phone: string; region: string }

export interface CaseRow {
  id: string; patient_id: string; transplant_pathway: Pathway; status: CaseStatus;
  preferred_region: string; created_at: string; updated_at: string;
}

export interface DocRow {
  id: string; case_id: string; patient_id: string; kind: DocKind; object_key: string;
  original_name: string; mime_type: string; bytes: number; uploaded_at: string;
}

export interface StaffProfile {
  id: string; full_name: string; role: StaffRole; speciality: string; license_number: string;
  organization: string; region: string; phone: string; status: StaffStatus; review_note: string;
  reviewed_by: string | null; reviewed_at: string | null; created_at: string; updated_at: string;
}
export type StaffInput = Pick<StaffProfile, "full_name" | "role" | "speciality" | "license_number" | "organization" | "region" | "phone">;
export type DirectoryEntry = Pick<StaffProfile, "id" | "full_name" | "role" | "speciality" | "organization" | "region">;

export interface Share { id: string; case_id: string; patient_id: string; staff_id: string; active: boolean; created_at: string; revoked_at: string | null }

export interface Note {
  id: string; case_id: string; author_id: string; author_name: string; author_is_staff: boolean;
  kind: NoteKind; body: string; created_at: string;
}

export interface AccessEntry { id: string; document_id: string; document_name: string; viewer_name: string; viewed_at: string }

/** Everything a case page needs, already filtered for the viewer. */
export interface CaseBundle {
  viewer: "patient" | "staff";
  case: CaseRow;
  patient: Profile;
  documents: Omit<DocRow, "object_key">[];
  checklist: string[];
  shares: (Share & { staff: DirectoryEntry | null })[];
  notes: Note[];
  accessLog: AccessEntry[];
}

/** One row of the doctor's patient list. */
export interface SharedCaseRow {
  case: CaseRow; patient: Profile; shared_at: string; documents: number;
  last_patient_message_at: string | null; last_staff_message_at: string | null;
}

/** Metadata-only view used by admins and the AI agent (no message text, no files). */
export interface CaseOverviewRow {
  case_id: string; patient_name: string; region: string; pathway: Pathway; status: CaseStatus;
  created_at: string; updated_at: string; documents: number; active_shares: number;
  last_patient_message_at: string | null; last_staff_message_at: string | null;
}

export interface PlatformStats {
  patients: number; cases: number; cases_by_status: Record<string, number>; documents: number;
  staff_by_status: Record<string, number>; active_shares: number; notes_last_7_days: number;
}

export interface ActivityEntry { at: string; kind: string; actor: string; detail: string }

export interface AgentAuditEntry { id: string; at: string; admin_id: string; tool: string; input: string; result: string; approved: boolean }

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
