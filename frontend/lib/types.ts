// Mirrors backend/src/types.ts (the shapes returned by the API).
export type CaseStatus = "draft" | "documents_pending" | "under_review" | "centre_contacted" | "closed";
export interface Profile { id: string; full_name: string; phone: string; region: string }
export interface CaseRow { id: string; patient_id: string; transplant_pathway: string; status: CaseStatus; preferred_region: string; created_at: string; updated_at: string }
export interface Doc { id: string; case_id: string; kind: string; original_name: string; mime_type: string; bytes: number; uploaded_at: string }
export interface DirectoryEntry { id: string; full_name: string; role: "doctor" | "coordinator"; speciality: string; organization: string; region: string }
export interface Share { id: string; case_id: string; staff_id: string; active: boolean; created_at: string; staff: DirectoryEntry | null }
export interface Note { id: string; author_id: string; author_name: string; author_is_staff: boolean; kind: "message" | "document_request" | "conclusion" | "status"; body: string; created_at: string }
export interface AccessEntry { id: string; document_id: string; document_name: string; viewer_name: string; viewed_at: string }
export interface CaseBundle { viewer: "patient" | "staff"; case: CaseRow; patient: Profile; documents: Doc[]; checklist: string[]; shares: Share[]; notes: Note[]; accessLog: AccessEntry[] }
export interface Me { user: { id: string; isAdmin: boolean; email: string; phone: string }; profile: Profile; mode: "demo" | "supabase" }
