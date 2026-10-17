import type { FundingStatus } from '../data/types';
import type { ImportPayloadRow } from '../data/store';
import { INSTITUTIONS } from '../data/seed';
import { validateSaId } from './saId';

export const IMPORT_COLUMNS = [
  'first_name', 'last_name', 'id_number', 'student_number', 'institution',
  'qualification', 'year_of_study', 'funding_status', 'cellphone', 'email',
] as const;

// Columns we refuse to import because the purpose doesn't need them (POPIA minimality).
export const BLOCKED_COLUMNS = ['race', 'religion', 'health', 'disability', 'medical', 'income', 'household_income', 'criminal'];

export type Severity = 'error' | 'warning';
export interface Issue {
  field: string;
  severity: Severity;
  message: string;
}
export interface RowResult {
  line: number;
  values: Record<string, string>;
  issues: Issue[];
  payload?: ImportPayloadRow;
}

export interface Conflicts {
  ids: Set<string>; // ID numbers already on record
  keys: Set<string>; // "institution|student_number" already on record
}

// What to ask the server about before checking the file in detail.
export function conflictQuery(table: string[][]) {
  const [header = [], ...body] = table;
  const cols = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const col = (row: string[], name: string) => (row[cols.indexOf(name)] ?? '').trim();
  return {
    ids: body.map((r) => col(r, 'id_number').replace(/\s/g, '')).filter(Boolean),
    keys: body.map((r) => `${col(r, 'institution')}|${col(r, 'student_number')}`),
  };
}
export interface ImportReport {
  rows: RowResult[];
  missingColumns: string[];
  droppedColumns: string[];
}

const FUNDING: FundingStatus[] = ['Funded', 'Pending', 'Appeal', 'Unfunded'];

export function checkImport(table: string[][], existing: Conflicts): ImportReport {
  const [header = [], ...body] = table;
  const cols = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const missingColumns = IMPORT_COLUMNS.filter((c) => !cols.includes(c));
  const droppedColumns = header.filter((_, i) => BLOCKED_COLUMNS.some((b) => cols[i].includes(b)));

  const inFile = new Map<string, number>();

  const rows = body.map((cells, idx): RowResult => {
    const v: Record<string, string> = {};
    cols.forEach((c, i) => {
      if (!BLOCKED_COLUMNS.some((b) => c.includes(b))) v[c] = (cells[i] ?? '').trim();
    });
    const issues: Issue[] = [];
    const err = (field: string, message: string) => issues.push({ field, severity: 'error', message });
    const warn = (field: string, message: string) => issues.push({ field, severity: 'warning', message });

    if (!v.first_name) err('first_name', 'First name is empty');
    if (!v.last_name) err('last_name', 'Last name is empty');

    const id = (v.id_number ?? '').replace(/\s/g, '');
    const idc = validateSaId(id);
    if (!idc.valid) err('id_number', idc.problem!);
    else if (idc.dob) {
      const age = (Date.now() - idc.dob.getTime()) / 3.15576e10;
      if (age < 15 || age > 60) warn('id_number', `ID implies age ${Math.floor(age)} — please confirm`);
    }

    if (existing.ids.has(id)) err('id_number', 'A student with this ID number is already on record');
    if (inFile.has(id)) err('id_number', `Same ID as line ${inFile.get(id)} in this file`);
    else if (id) inFile.set(id, idx + 2);

    if (!INSTITUTIONS.includes(v.institution)) {
      const near = INSTITUTIONS.find((i) => i.toLowerCase().startsWith((v.institution ?? '').toLowerCase().slice(0, 8)));
      err('institution', near ? `Unknown institution — did you mean “${near}”?` : 'Unknown institution');
    }
    if (existing.keys.has(`${v.institution}|${v.student_number}`))
      err('student_number', 'Student number already used at this institution');
    if (!v.student_number) err('student_number', 'Student number is empty');

    const year = Number(v.year_of_study);
    if (!Number.isInteger(year) || year < 1 || year > 7) err('year_of_study', 'Year of study must be 1–7');

    const fs = FUNDING.find((f) => f.toLowerCase() === (v.funding_status ?? '').toLowerCase());
    if (!fs) err('funding_status', `Funding status must be one of ${FUNDING.join(', ')}`);

    const phone = (v.cellphone ?? '').replace(/\D/g, '');
    if (!phone) warn('cellphone', 'No cellphone — record will be flagged incomplete');
    else if (!/^0[6-8]\d{8}$/.test(phone)) err('cellphone', 'Cellphone must be a 10-digit SA mobile number');

    if (!v.email) warn('email', 'No email — record will be flagged incomplete');
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) err('email', 'Email address is not valid');

    const ok = !issues.some((i) => i.severity === 'error');
    return {
      line: idx + 2,
      values: v,
      issues,
      payload: ok
        ? {
            first_name: v.first_name,
            last_name: v.last_name,
            id_number: id,
            student_number: v.student_number,
            institution: v.institution,
            qualification: v.qualification || '—',
            year_of_study: year,
            funding_status: fs!,
            cellphone: phone ? `${phone.slice(0, 3)} ${phone.slice(3)}` : '',
            email: v.email ?? '',
          }
        : undefined,
    };
  });
  return { rows, missingColumns, droppedColumns };
}

// A deliberately messy sample, the kind of file that arrives from an institution.
export const SAMPLE_CSV = `first_name,last_name,id_number,student_number,institution,qualification,year_of_study,funding_status,cellphone,email,household_income
Ofentse,Mabena,0303150845087,201845771,University of Limpopo,BSc Computer Science,2,Funded,072 555 0198,ofentse.m@example.ac.za,R85000
Grace,Petersen,0207310123089,T4410022,False Bay TVET College,N6 Electrical Engineering,1,pending,083 410 2231,,R40000
Kabelo,Ramaphiri,0412315012088,219900123,Tshwane University of Technology,Diploma in IT,1,Funded,0612233445,kabelo@example,R60000
Nandi,Cele,0502290234081,220011456,Walter Sisulu Univ,BEd Foundation Phase,3,Funded,079 881 2020,nandi.cele@example.ac.za,R30000
Ofentse,Mabena,0303150845087,201845799,University of Limpopo,BSc Computer Science,2,Funded,072 555 0198,ofentse.m@example.ac.za,R85000
Zinhle,Mkhize,0108125432089,221344009,University of Zululand,BNursing,9,Approved,078 123 4567,zinhle.m@example.ac.za,R25000
Ruan,Steyn,0110105123084,T5520011,Motheo TVET College,NC(V) Office Administration,2,Appeal,,ruan.steyn@example.ac.za,R70000`;
