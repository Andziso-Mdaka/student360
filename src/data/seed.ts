// Synthetic demo data only. No real people, no real NSFAS figures.
import { makeSaId } from '../lib/saId';
import type { Case, CaseStatus, CaseType, FundingStatus, SeedStudent, User } from './types';
import { CASE_TYPES } from './types';

export const USERS: User[] = [
  { id: 'u1', name: 'Thandi Mokoena', role: 'officer' },
  { id: 'u2', name: 'Lebo Naidoo', role: 'officer' },
  { id: 'u3', name: 'Sipho Khumalo', role: 'officer' },
  { id: 'u4', name: 'Anika van Wyk', role: 'manager' },
  { id: 'u5', name: 'Ayanda Dlamini', role: 'admin' },
];
export const OFFICERS = USERS.filter((u) => u.role === 'officer');

export const INSTITUTIONS = [
  'University of Limpopo',
  'Tshwane University of Technology',
  'Walter Sisulu University',
  'University of Zululand',
  'Central University of Technology',
  'Ekurhuleni East TVET College',
  'False Bay TVET College',
  'Motheo TVET College',
];

const QUALS = [
  'BEd Foundation Phase', 'BSc Computer Science', 'Diploma in IT', 'BCom Accounting',
  'N6 Electrical Engineering', 'NC(V) Office Administration', 'BNursing', 'Diploma in Civil Engineering',
];
const FIRST = [
  'Lerato', 'Kagiso', 'Nomvula', 'Thabo', 'Ayesha', 'Sibusiso', 'Zanele', 'Pieter', 'Mpho', 'Naledi',
  'Bongani', 'Refilwe', 'Kyle', 'Palesa', 'Lindiwe', 'Tshepo', 'Fatima', 'Musa', 'Karabo', 'Unathi',
  'Precious', 'Andile', 'Chantel', 'Neo', 'Siyabonga', 'Dineo', 'Johan', 'Ntombi', 'Lwazi', 'Keamogetse',
];
const LAST = [
  'Mahlangu', 'Botha', 'Ndlovu', 'Mthembu', 'Pillay', 'Mabaso', 'Molefe', 'Jacobs', 'Sithole', 'Nkosi',
  'Baloyi', 'Maluleke', 'Adams', 'Hendricks', 'Zulu', 'Mokwena', 'Govender', 'Radebe', 'Ngcobo', 'Mathebula',
];

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

export function generateSeed(today = new Date()) {
  const r = rng(360);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const students: SeedStudent[] = [];
  const N = 480;

  for (let i = 0; i < N; i++) {
    const female = r() < 0.56;
    const age = 18 + Math.floor(r() * 9);
    const dob = new Date(Date.UTC(today.getFullYear() - age, Math.floor(r() * 12), 1 + Math.floor(r() * 28)));
    const firstName = pick(FIRST);
    const lastName = pick(LAST);
    const inst = INSTITUTIONS[Math.floor(Math.pow(r(), 1.3) * INSTITUTIONS.length)];
    const tvet = inst.includes('TVET');
    const fs: FundingStatus = r() < 0.72 ? 'Funded' : r() < 0.5 ? 'Pending' : r() < 0.6 ? 'Appeal' : 'Unfunded';
    students.push({
      id: `s${i + 1}`,
      firstName,
      lastName,
      idNumber: makeSaId(dob, female, Math.floor(r() * 4999)),
      studentNumber: (tvet ? 'T' : '2') + String(10000000 + Math.floor(r() * 89999999)).slice(0, tvet ? 7 : 8),
      institution: inst,
      qualification: tvet ? pick(QUALS.filter((q) => q.startsWith('N'))) : pick(QUALS.filter((q) => !q.startsWith('N'))),
      yearOfStudy: 1 + Math.floor(r() * (tvet ? 3 : 4)),
      fundingStatus: fs,
      cellphone: r() < 0.06 ? '' : `0${pick(['6', '7', '8'])}${Math.floor(r() * 10)} ${String(Math.floor(r() * 1e7)).padStart(7, '0')}`,
      email: r() < 0.08 ? '' : `${firstName}.${lastName}${Math.floor(r() * 99)}@example.ac.za`.toLowerCase(),
      verified: r() > 0.09,
      createdAt: iso(addDays(today, -Math.floor(r() * 700))),
    });
  }
  // A few likely duplicates (same ID captured twice with a different student number) — a classic spreadsheet problem.
  for (const k of [12, 77, 203, 341]) {
    const s = students[k];
    students.push({ ...s, id: `s${students.length + 1}`, studentNumber: s.studentNumber.slice(0, -2) + '00', verified: false });
  }

  const cases: Case[] = [];
  const statuses: CaseStatus[] = ['Open', 'In progress', 'Awaiting student', 'Escalated', 'Resolved'];
  for (let i = 0; i < 260; i++) {
    const s = students[Math.floor(r() * students.length)];
    const created = addDays(today, -Math.floor(r() * 60) - 1);
    const status: CaseStatus = r() < 0.3 ? 'Resolved' : pick(statuses.slice(0, 4));
    // follow-up between 6 days ago and 23 days ahead; resolved ones in the past
    const follow = addDays(today, status === 'Resolved' ? -Math.floor(r() * 20) : Math.floor(r() * 30) - 6);
    const type: CaseType = s.fundingStatus === 'Appeal' && r() < 0.6 ? 'Funding appeal' : pick(CASE_TYPES);
    const assignee = pick(OFFICERS).id;
    cases.push({
      id: `C-${String(24100 + i)}`,
      studentId: s.id,
      type,
      status,
      priority: r() < 0.15 ? 'High' : r() < 0.8 ? 'Normal' : 'Low',
      assigneeId: assignee,
      followUp: iso(follow),
      createdAt: created.toISOString(),
      history: [{ at: created.toISOString(), by: assignee, text: `Case opened: ${type}` }],
    });
  }
  return { students, cases };
}
