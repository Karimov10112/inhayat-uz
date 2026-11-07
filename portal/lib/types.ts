// Mirrors backend/src/types.ts
export type CaseStatus = "draft" | "documents_pending" | "under_review" | "centre_contacted" | "closed";
export interface Profile { id: string; full_name: string; phone: string; region: string }
export interface CaseRow { id: string; patient_id: string; transplant_pathway: string; status: CaseStatus; preferred_region: string; created_at: string; updated_at: string }
export interface Doc { id: string; kind: string; original_name: string; mime_type: string; bytes: number; uploaded_at: string }
export interface Note { id: string; author_id: string; author_name: string; author_is_staff: boolean; kind: string; body: string; created_at: string }
export interface CaseBundle { viewer: "patient" | "staff"; case: CaseRow; patient: Profile; documents: Doc[]; checklist: string[]; notes: Note[] }
export interface SharedCaseRow { case: CaseRow; patient: Profile; shared_at: string; documents: number; last_patient_message_at: string | null; last_staff_message_at: string | null }
export interface StaffProfile {
  id: string; full_name: string; role: "doctor" | "coordinator"; speciality: string; license_number: string;
  organization: string; region: string; phone: string; status: "pending" | "approved" | "rejected" | "suspended";
  review_note: string; created_at: string; reviewed_at: string | null;
}
export interface Me { user: { id: string; isAdmin: boolean; email: string; phone: string }; staff: StaffProfile | null; mode: "demo" | "supabase" }
export interface CaseOverviewRow { case_id: string; patient_name: string; region: string; pathway: string; status: CaseStatus; created_at: string; updated_at: string; documents: number; active_shares: number; last_patient_message_at: string | null; last_staff_message_at: string | null }
export interface Alert { id: string; level: "critical" | "warning" | "info"; title: string; detail: string; suggestion: string; case_id?: string; staff_id?: string }
export interface Dashboard {
  stats: { patients: number; cases: number; cases_by_status: Record<string, number>; documents: number; staff_by_status: Record<string, number>; active_shares: number; notes_last_7_days: number };
  cases: CaseOverviewRow[]; activity: { at: string; kind: string; actor: string; detail: string }[]; alerts: Alert[];
  system: { mode: string; storage: string; aiProvider: string; uptime_minutes: number };
}
