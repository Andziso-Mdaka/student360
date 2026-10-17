// Data layer backed by Supabase. Reads go through Row Level Security; every write is an RPC
// (SQL function) that checks the caller's role and writes the audit log on the server.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { friendlyError, supabase } from '../lib/supabase';
import type { AuditAction, AuditEvent, Case, CasePriority, CaseStatus, CaseType, RevealField, Student, User } from './types';

export class ActionError extends Error {}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new ActionError(friendlyError(error));
  return data as T;
}

const STUDENT_COLUMNS =
  'id, first_name, last_name, id_last4, student_number, institution, qualification, year_of_study, funding_status, cellphone_masked, email_masked, verified, created_at';

/* eslint-disable @typescript-eslint/no-explicit-any */
const toStudent = (r: any): Student => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  idLast4: r.id_last4,
  studentNumber: r.student_number,
  institution: r.institution,
  qualification: r.qualification,
  yearOfStudy: r.year_of_study,
  fundingStatus: r.funding_status,
  cellphoneMasked: r.cellphone_masked,
  emailMasked: r.email_masked,
  verified: r.verified,
  createdAt: r.created_at,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface ImportPayloadRow {
  first_name: string;
  last_name: string;
  id_number: string;
  student_number: string;
  institution: string;
  qualification: string;
  year_of_study: number;
  funding_status: string;
  cellphone: string;
  email: string;
}

interface Ctx {
  session: Session | null;
  authReady: boolean;
  loading: boolean;
  loadError: string | null;
  user: User | null;
  users: User[];
  students: Student[];
  cases: Case[];
  audit: AuditEvent[];
  duplicateStudentIds: Set<string>;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  log: (action: Extract<AuditAction, 'view_record' | 'import_preview' | 'report_export'>, target: string, detail: string) => Promise<void>;
  reveal: (studentId: string, field: RevealField, reason: string) => Promise<string>;
  idProblem: (studentId: string) => Promise<string | null>;
  findByIdNumber: (idNumber: string) => Promise<string[]>;
  createCase: (studentId: string, type: CaseType, priority: CasePriority, followUp: string, note: string) => Promise<string>;
  updateCase: (id: string, status: CaseStatus, followUp: string, assigneeId: string, note: string) => Promise<void>;
  importConflicts: (ids: string[], keys: string[]) => Promise<{ ids: Set<string>; keys: Set<string> }>;
  importStudents: (rows: ImportPayloadRow[], fileName: string) => Promise<{ imported: number; rejected: number }>;
  verifyChain: () => Promise<{ ok: boolean; brokenAt: number | null; total: number }>;
  tamperDemo: (undo: boolean) => Promise<void>;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [dups, setDups] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN') supabase.rpc('log_event', { p_action: 'login', p_target: s?.user.id ?? '', p_detail: 'Signed in' });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id ?? null;
  const user = users.find((u) => u.id === uid) ?? null;

  const refresh = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { data: profiles, error: pe } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
      if (pe) throw pe;
      const us: User[] = profiles.map((p) => ({ id: p.id, name: p.full_name, role: p.role }));
      setUsers(us);
      const me = us.find((u) => u.id === uid);
      if (!me) throw new Error('Your account has no Student360 role yet. Ask an administrator to add you.');

      const canStudents = me.role === 'officer' || me.role === 'manager';
      const [st, cs, ev, au, dp] = await Promise.all([
        canStudents ? supabase.from('students').select(STUDENT_COLUMNS).order('last_name').range(0, 9999) : null,
        canStudents ? supabase.from('cases').select('id, student_id, type, status, priority, assignee_id, follow_up, created_at').range(0, 9999) : null,
        canStudents ? supabase.from('case_events').select('case_id, at, by, text').order('at').range(0, 9999) : null,
        me.role === 'admin' ? supabase.from('audit_log').select('*').order('seq', { ascending: false }).limit(500) : null,
        canStudents ? supabase.rpc('duplicate_student_ids') : null,
      ]);
      for (const r of [st, cs, ev, au, dp]) if (r?.error) throw r.error;

      setStudents((st?.data ?? []).map(toStudent));
      const history = new Map<string, Case['history']>();
      for (const e of ev?.data ?? []) {
        const list = history.get(e.case_id) ?? [];
        list.push({ at: e.at, by: e.by, text: e.text });
        history.set(e.case_id, list);
      }
      setCases(
        (cs?.data ?? []).map((c) => ({
          id: c.id,
          studentId: c.student_id,
          type: c.type,
          status: c.status,
          priority: c.priority,
          assigneeId: c.assignee_id,
          followUp: c.follow_up,
          createdAt: c.created_at,
          history: history.get(c.id) ?? [],
        })),
      );
      setAudit(
        (au?.data ?? [])
          .map((a) => ({ seq: a.seq, at: a.at, userId: a.user_id, action: a.action, target: a.target, detail: a.detail, prevHash: a.prev_hash, hash: a.hash }))
          .reverse(),
      );
      setDups(new Set((dp?.data as string[] | null) ?? []));
    } catch (e) {
      setLoadError(friendlyError(e as Error));
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    if (uid) refresh();
    else {
      setUsers([]);
      setStudents([]);
      setCases([]);
      setAudit([]);
    }
  }, [uid, refresh]);

  const value = useMemo<Ctx>(
    () => ({
      session,
      authReady,
      loading,
      loadError,
      user,
      users,
      students,
      cases,
      audit,
      duplicateStudentIds: dups,
      refresh,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new ActionError(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      log: async (action, target, detail) => {
        await rpc('log_event', { p_action: action, p_target: target, p_detail: detail });
      },
      reveal: (studentId, field, reason) => rpc<string>('reveal_student_field', { p_student: studentId, p_field: field, p_reason: reason }),
      idProblem: (studentId) => rpc<string | null>('student_id_problem', { p_student: studentId }),
      findByIdNumber: (id) => rpc<string[]>('find_students_by_id_number', { p_id: id }),
      createCase: async (studentId, type, priority, followUp, note) => {
        const id = await rpc<string>('create_case', { p_student: studentId, p_type: type, p_priority: priority, p_follow_up: followUp, p_note: note });
        await refresh();
        return id;
      },
      updateCase: async (id, status, followUp, assigneeId, note) => {
        await rpc('update_case', { p_case: id, p_status: status, p_follow_up: followUp, p_assignee: assigneeId, p_note: note });
        await refresh();
      },
      importConflicts: async (ids, keys) => {
        const rows = await rpc<{ value: string; kind: string }[]>('import_conflicts', { p_ids: ids, p_keys: keys });
        return {
          ids: new Set(rows.filter((r) => r.kind === 'id').map((r) => r.value)),
          keys: new Set(rows.filter((r) => r.kind === 'student_number').map((r) => r.value)),
        };
      },
      importStudents: async (rows, fileName) => {
        const res = await rpc<{ imported: number; rejected: number }>('import_students', { p_rows: rows, p_file: fileName });
        await refresh();
        return res;
      },
      verifyChain: async () => {
        const [r] = await rpc<{ ok: boolean; broken_at: number | null; total: number }[]>('verify_audit_chain');
        return { ok: r.ok, brokenAt: r.broken_at, total: r.total };
      },
      tamperDemo: async (undo) => {
        await rpc('demo_tamper_audit', { p_undo: undo });
        await refresh();
      },
    }),
    [session, authReady, loading, loadError, user, users, students, cases, audit, dups, refresh],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('useStore outside provider');
  return c;
}

// Shared helpers
export const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const isOverdue = (c: Case) => c.status !== 'Resolved' && c.followUp < todayIso();
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b.slice(0, 10)).getTime() - new Date(a.slice(0, 10)).getTime()) / 86400000);
export const isIncomplete = (s: Student) => !s.cellphoneMasked || !s.emailMasked || !s.verified;

// The signed-in user. Only used inside the app shell, where a user always exists.
export function useMe(): User {
  const u = useStore().user;
  if (!u) throw new Error('useMe outside signed-in shell');
  return u;
}
