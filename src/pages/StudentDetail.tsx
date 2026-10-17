import { useEffect, useRef, useState } from 'react';
import { isOverdue, useMe, useStore } from '../data/store';
import { can, maskedId, REVEAL_REASONS } from '../lib/rbac';
import { hasIdNumber } from '../lib/saId';
import { FundingPill, Modal, PriorityTag, StatusPill, fmtDate } from '../components/ui';
import { useNav } from '../App';
import { CASE_TYPES, type CasePriority, type CaseType, type RevealField as Field } from '../data/types';

const FIELD_LABEL: Record<Field, string> = { id_number: 'ID number', cellphone: 'Cellphone', email: 'Email' };
const REVEAL_SECONDS = 60;

export default function StudentDetail({ id }: { id: string }) {
  const { students, cases, users, log, createCase, reveal, idProblem, duplicateStudentIds } = useStore();
  const user = useMe();
  const { go, toast } = useNav();
  const s = students.find((x) => x.id === id);
  const logged = useRef(false);
  // Revealed values live only in memory, only for REVEAL_SECONDS.
  const [revealed, setRevealed] = useState<Partial<Record<Field, { value: string; until: number }>>>({});
  const [idCheck, setIdCheck] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<Field | null>(null);
  const [reason, setReason] = useState<string>(REVEAL_REASONS[0]);
  const [newCase, setNewCase] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (s && !logged.current) {
      logged.current = true;
      log('view_record', s.id, `Opened record ${s.studentNumber}`).catch(() => {});
      idProblem(s.id).then(setIdCheck, () => setIdCheck(undefined));
    }
  }, [s, log, idProblem]);

  // Re-mask automatically when the reveal window ends.
  useEffect(() => {
    const t = window.setInterval(() => {
      const now = Date.now();
      setRevealed((r) => {
        const next = Object.fromEntries(Object.entries(r).filter(([, v]) => v!.until > now));
        return Object.keys(next).length === Object.keys(r).length ? r : next;
      });
      tick((n) => n + 1);
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  if (!s) return <div className="page"><div className="empty">Record not found.</div></div>;

  const mayReveal = can(user.role, 'students.reveal');
  const myCases = cases.filter((c) => c.studentId === s.id);
  const isDup = duplicateStudentIds.has(s.id);

  const masked = (f: Field) => {
    const m = f === 'id_number' ? maskedId(s.idLast4) : f === 'cellphone' ? s.cellphoneMasked : s.emailMasked;
    if (!m) return <span className="pill warn">Not captured</span>;
    const r = revealed[f];
    if (r) {
      return (
        <>
          <span className="revealed">{r.value}</span>
          <span className="small muted">re-masks in {Math.max(0, Math.ceil((r.until - Date.now()) / 1000))}s</span>
        </>
      );
    }
    return (
      <>
        <span className="masked">{m}</span>
        {mayReveal ? (
          <button className="btn ghost" onClick={() => setAsking(f)}>
            Reveal
          </button>
        ) : (
          <span className="small muted">Your role can't reveal this</span>
        )}
      </>
    );
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button className="btn ghost" style={{ paddingLeft: 0 }} onClick={() => go({ page: 'students' })}>
            ← Students
          </button>
          <h1>
            {s.firstName} {s.lastName}
          </h1>
          <p>
            {s.qualification} · Year {s.yearOfStudy} · {s.institution}
          </p>
        </div>
        {can(user.role, 'cases.create') && (
          <button className="btn primary" onClick={() => setNewCase(true)}>
            Open a case
          </button>
        )}
      </div>

      {isDup && (
        <div className="callout crit">
          <b>Possible duplicate</b>
          Another record has the same ID number. Check both before acting, and ask an administrator to merge them.
        </div>
      )}

      <div className="grid g-3-1">
        <section className="panel">
          <div className="panel-head">
            <h2>Record</h2>
            <span className="small muted">Every reveal is written to the audit log with your reason.</span>
          </div>
          <div className="panel-body">
            <dl className="kv">
              <dt>Student number</dt>
              <dd className="mono">{s.studentNumber}</dd>
              <dt>ID number</dt>
              <dd>{masked('id_number')}</dd>
              <dt>ID check</dt>
              <dd>
                {idCheck === undefined ? (
                  <span className="small muted">Checking…</span>
                ) : idCheck === null ? (
                  <span className="pill ok">Checksum valid</span>
                ) : (
                  <span className="pill crit">{idCheck}</span>
                )}
              </dd>
              <dt>Funding status</dt>
              <dd>
                <FundingPill status={s.fundingStatus} />
              </dd>
              <dt>Cellphone</dt>
              <dd>{masked('cellphone')}</dd>
              <dt>Email</dt>
              <dd>{masked('email')}</dd>
              <dt>Identity verified</dt>
              <dd>{s.verified ? <span className="pill ok">Verified</span> : <span className="pill warn">Not yet verified</span>}</dd>
              <dt>On record since</dt>
              <dd>{fmtDate(s.createdAt)}</dd>
            </dl>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Cases ({myCases.length})</h2>
          </div>
          {myCases.length === 0 ? (
            <div className="empty">No cases for this student.</div>
          ) : (
            <ul className="queue">
              {myCases.map((c) => (
                <li key={c.id} onClick={() => go({ page: 'cases', caseId: c.id })}>
                  <span className={`stripe ${isOverdue(c) ? '' : 'warn'}`} style={isOverdue(c) ? undefined : { background: 'var(--line)' }} />
                  <span style={{ minWidth: 0 }}>
                    <b>{c.type}</b>
                    <div className="small muted">
                      <span className="mono">{c.id}</span> · follow up {fmtDate(c.followUp)}
                    </div>
                  </span>
                  <StatusPill status={c.status} overdue={isOverdue(c)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {asking && (
        <Modal
          title={`Reveal ${FIELD_LABEL[asking].toLowerCase()}`}
          onClose={() => setAsking(null)}
          footer={
            <>
              <button className="btn" onClick={() => setAsking(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const value = await reveal(s.id, asking, reason);
                    setRevealed((r) => ({ ...r, [asking]: { value, until: Date.now() + REVEAL_SECONDS * 1000 } }));
                    toast('Revealed for 60 seconds and logged');
                  } catch (e) {
                    toast((e as Error).message);
                  } finally {
                    setBusy(false);
                    setAsking(null);
                  }
                }}
              >
                Reveal for {REVEAL_SECONDS}s
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>Choose why you need to see this. Your name, the time and the reason are recorded.</p>
          <div className="field">
            <span>Purpose</span>
            {REVEAL_REASONS.map((r) => (
              <label key={r} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
                <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
                {r}
              </label>
            ))}
          </div>
        </Modal>
      )}

      {newCase && (
        <NewCaseModal
          onClose={() => setNewCase(false)}
          onCreate={async (type, priority, followUp, note) => {
            try {
              const cid = await createCase(s.id, type, priority, followUp, note);
              setNewCase(false);
              toast(`Case ${cid} opened and assigned to you`);
            } catch (e) {
              toast((e as Error).message);
            }
          }}
          assignee={users.find((u) => u.id === user.id)?.name ?? user.name}
        />
      )}
    </div>
  );
}

function NewCaseModal({
  onClose,
  onCreate,
  assignee,
}: {
  onClose: () => void;
  onCreate: (t: CaseType, p: CasePriority, followUp: string, note: string) => Promise<void>;
  assignee: string;
}) {
  const [type, setType] = useState<CaseType>(CASE_TYPES[0]);
  const [priority, setPriority] = useState<CasePriority>('Normal');
  const [follow, setFollow] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      title="Open a case"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={hasIdNumber(note) || saving}
            onClick={async () => {
              setSaving(true);
              await onCreate(type, priority, follow, note.trim());
              setSaving(false);
            }}
          >
            Open case
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Case type</span>
          <select id="case-type" className="select" value={type} onChange={(e) => setType(e.target.value as CaseType)}>
            {CASE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Priority</span>
          <select id="case-priority" className="select" value={priority} onChange={(e) => setPriority(e.target.value as CasePriority)}>
            {(['Low', 'Normal', 'High'] as const).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Follow up by</span>
          <input id="case-follow" type="date" className="input" value={follow} onChange={(e) => setFollow(e.target.value)} />
        </label>
        <label className="field">
          <span>Assigned to</span>
          <input className="input" value={assignee} disabled />
        </label>
      </div>
      <label className="field" style={{ marginTop: 12 }}>
        <span>First note (no ID numbers or health details)</span>
        <textarea id="case-note" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {hasIdNumber(note) && (
        <div className="callout crit" style={{ marginTop: 8 }}>
          <b>Remove the ID number from the note</b>
          It's already on the student's record. Notes are visible to more people than the masked field.
        </div>
      )}
      <p className="small muted" style={{ marginBottom: 0 }}>
        <PriorityTag p={priority} /> High-priority cases surface first in the manager's queue.
      </p>
    </Modal>
  );
}
