export type Role = 'officer' | 'manager' | 'admin';

export interface User {
  id: string;
  name: string;
  role: Role;
}

export type FundingStatus = 'Funded' | 'Pending' | 'Appeal' | 'Unfunded';

// What the generator produces (and what seed.sql loads). Contains raw personal information.
export interface SeedStudent {
  id: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  studentNumber: string;
  institution: string;
  qualification: string;
  yearOfStudy: number;
  fundingStatus: FundingStatus;
  cellphone: string;
  email: string;
  verified: boolean;
  createdAt: string;
}

// What the app can read from the API. The database never sends full ID numbers or contact details here.
export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  idLast4: string;
  studentNumber: string;
  institution: string;
  qualification: string;
  yearOfStudy: number;
  fundingStatus: FundingStatus;
  cellphoneMasked: string | null; // null = not captured
  emailMasked: string | null;
  verified: boolean;
  createdAt: string;
}

export type CaseStatus = 'Open' | 'In progress' | 'Awaiting student' | 'Escalated' | 'Resolved';
export type CasePriority = 'Low' | 'Normal' | 'High';

export const CASE_TYPES = [
  'Allowance not received',
  'Registration confirmation',
  'Funding appeal',
  'Document verification',
  'Bank details update',
  'Academic progress review',
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export interface CaseEvent {
  at: string;
  by: string; // user id
  text: string;
}

export interface Case {
  id: string;
  studentId: string;
  type: CaseType;
  status: CaseStatus;
  priority: CasePriority;
  assigneeId: string;
  followUp: string; // ISO date (yyyy-mm-dd)
  createdAt: string;
  history: CaseEvent[];
}

export type AuditAction =
  | 'login'
  | 'view_record'
  | 'reveal_field'
  | 'case_create'
  | 'case_update'
  | 'case_assign'
  | 'import_preview'
  | 'import_commit'
  | 'report_export'
  | 'data_reset';

export type RevealField = 'id_number' | 'cellphone' | 'email';

export interface AuditEvent {
  seq: number;
  at: string;
  userId: string | null;
  action: AuditAction;
  target: string;
  detail: string;
  prevHash: string;
  hash: string;
}
