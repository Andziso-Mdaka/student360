import type { Role } from '../data/types';

// Least privilege: each role gets only what its journey needs.
export type Permission =
  | 'students.view'
  | 'students.reveal'
  | 'cases.create'
  | 'cases.viewAll'
  | 'cases.assign'
  | 'reports.export'
  | 'import.run'
  | 'audit.view';

const MATRIX: Record<Role, Permission[]> = {
  officer: ['students.view', 'students.reveal', 'cases.create'],
  manager: ['students.view', 'cases.viewAll', 'cases.assign', 'reports.export'],
  admin: ['import.run', 'audit.view'],
};

export const ROLE_LABEL: Record<Role, string> = {
  officer: 'Case officer',
  manager: 'Manager',
  admin: 'Administrator',
};

export const can = (role: Role, p: Permission) => MATRIX[role].includes(p);
export const permissionsFor = (role: Role) => MATRIX[role];

export const PERMISSION_LABEL: Record<Permission, string> = {
  'students.view': 'View student records',
  'students.reveal': 'Reveal ID & contact (with reason)',
  'cases.create': 'Create & update own cases',
  'cases.viewAll': 'See all cases',
  'cases.assign': 'Reassign cases',
  'reports.export': 'Export aggregate reports',
  'import.run': 'Import student files',
  'audit.view': 'Read audit log',
};

export const REVEAL_REASONS = [
  'Verifying identity with the student on a call',
  'Matching a document the student submitted',
  'Contacting the student about an open case',
] as const;

export const maskedId = (last4: string) => '•••••••••' + last4;
