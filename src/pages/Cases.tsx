import { useMemo, useState } from 'react';
import { daysBetween, isOverdue, todayIso, useMe, useStore } from '../data/store';
import { INSTITUTIONS, OFFICERS } from '../data/seed';
import { can } from '../lib/rbac';
import { hasIdNumber } from '../lib/saId';
import { Modal, PriorityTag, StatusPill, fmtDate, fmtDateTime } from '../components/ui';
import { useNav } from '../App';
import type { Case, CaseStatus } from '../data/types';

const STATUSES: CaseStatus[] = ['Open', 'In progress', 'Awaiting student', 'Escalated', 'Resolved'];
const PRIORITY_RANK = { High: 0, Normal: 1, Low: 2 };

export default function Cases({ initialOverdue, openCaseId }: { initialOverdue?: boolean; openCaseId?: string }) {
  const { cases, students, users } = useStore();
  const user = useMe();
  const { go } = useNav();
  const seeAll = can(user.role, 'cases.viewAll');
  const [status, setStatus] = useState<CaseStatus | 'active' | ''>('active');
  const [inst, setInst] = useState('');
  const [assignee, setAssignee] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(!!initialOverdue);
  const [selected, setSelected] = useState<string | null>(openCaseId ?? null);

  const sById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const rows = useMemo(
    () =>
      cases
        .filter((c) => (seeAll ? true : c.assigneeId === user.id))
        .filter((c) => (status === 'active' ? c.status !== 'Resolved' : status ? c.status === status : true))
        .filter((c) => !inst || sById.get(c.studentId)?.institution === inst)
        .filter((c) => !assignee || c.assigneeId === assignee)
        .filter((c) => !overdueOnly || isOverdue(c))
        .sort(
          (a, b) =>
            Number(isOverdue(b)) - Number(isOverdue(a)) ||
            PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
            a.followUp.localeCompare(b.followUp),
        ),
    [cases, seeAll, user.id, status, inst, assignee, overdueOnly, sById],
  );

  const sel = cases.find((c) => c.id === selected);
  const overdueCount = rows.filter(isOverdue).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">{seeAll ? 'All cases' : 'My cases'}</span>
          <h1>{seeAll ? 'Case backlog' : `Your work, ${user.name.split(' ')[0]}`}</h1>
          <p>Overdue first, then by priority and follow-up date. Open a case to update it.</p>
        </div>
        {!seeAll && (
          <button className="btn" onClick={() => go({ page: 'students' })}>
            Find a student to open a case
          </button>
        )}
      </div>

      <section className="panel">
        <div className="panel-head">
          <div className="toolbar">
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
              <option value="active">All unresolved</option>
              <option value="">Any status</option>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select className="select" value={inst} onChange={(e) => setInst(e.target.value)} aria-label="Institution">
              <option value="">All institutions</option>
              {INSTITUTIONS.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
            {seeAll && (
              <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee">
                <option value="">Anyone</option>
                {OFFICERS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            <label className="toolbar small">
              <input id="overdue-only" type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
              Overdue only
            </label>
          </div>
          <span className="small muted">
            {rows.length} cases{overdueCount ? ` · ${overdueCount} overdue` : ''}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Student</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Follow up</th>
                {seeAll && <th>Assigned to</th>}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((c) => {
                const s = sById.get(c.studentId);
                const od = isOverdue(c);
                const d = daysBetween(todayIso(), c.followUp);
                return (
                  <tr key={c.id} className="clickable" onClick={() => setSelected(c.id)}>
                    <td>
                      <b>{c.type}</b>
                      <div className="mono muted">{c.id}</div>
                    </td>
                    <td>
                      {s?.firstName} {s?.lastName}
                      <div className="small muted">{s?.institution}</div>
                    </td>
                    <td>
                      <StatusPill status={c.status} overdue={od} />
                    </td>
                    <td>
                      <PriorityTag p={c.priority} />
                    </td>
                    <td className="mono">
                      {fmtDate(c.followUp)}
                      {c.status !== 'Resolved' && (
                        <div className={od ? '' : 'muted'} style={od ? { color: 'var(--crit)' } : undefined}>
                          {od ? `${-d}d late` : d === 0 ? 'today' : `in ${d}d`}
                        </div>
                      )}
                    </td>
                    {seeAll && <td>{users.find((u) => u.id === c.assigneeId)?.name}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No cases match these filters.</div>}
          {rows.length > 100 && <div className="empty small">Showing the first 100. Narrow the filters to see the rest.</div>}
        </div>
      </section>

      {sel && <CaseModal c={sel} onClose={() => setSelected(null)} />}
    </div>
  );
}

function CaseModal({ c, onClose }: { c: Case; onClose: () => void }) {
  const { students, users, updateCase } = useStore();
  const user = useMe();
  const [saving, setSaving] = useState(false);
  const { go, toast } = useNav();
  const s = students.find((x) => x.id === c.studentId);
  const mayEdit = c.assigneeId === user.id || can(user.role, 'cases.assign');
  const [status, setStatus] = useState(c.status);
  const [follow, setFollow] = useState(c.followUp);
  const [assignee, setAssignee] = useState(c.assigneeId);
  const [note, setNote] = useState('');
  const name = (id: string) => users.find((u) => u.id === id)?.name ?? id;

  const changes: string[] = [];
  if (status !== c.status) changes.push(`Status ${c.status} → ${status}`);
  if (follow !== c.followUp) changes.push(`Follow-up moved to ${fmtDate(follow)}`);
  if (assignee !== c.assigneeId) changes.push(`Reassigned to ${name(assignee)}`);
  if (note.trim()) changes.push(note.trim());
  const blocked = hasIdNumber(note);

  return (
    <Modal
      title={`${c.id} · ${c.type}`}
      onClose={onClose}
      footer={
        mayEdit ? (
          <>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn primary"
              disabled={changes.length === 0 || blocked || saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await updateCase(c.id, status, follow, assignee, note.trim());
                  toast('Case updated');
                  onClose();
                } catch (e) {
                  toast((e as Error).message);
                  setSaving(false);
                }
              }}
            >
              Save update
            </button>
          </>
        ) : undefined
      }
    >
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <StatusPill status={c.status} overdue={isOverdue(c)} />
        <PriorityTag p={c.priority} />
        {s && can(user.role, 'students.view') && (
          <button className="btn ghost" onClick={() => go({ page: 'student', id: s.id })}>
            {s.firstName} {s.lastName} →
          </button>
        )}
      </div>

      {mayEdit ? (
        <div className="form-grid">
          <label className="field">
            <span>Status</span>
            <select id="edit-status" className="select" value={status} onChange={(e) => setStatus(e.target.value as CaseStatus)}>
              {STATUSES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Follow up by</span>
            <input id="edit-follow" type="date" className="input" value={follow} onChange={(e) => setFollow(e.target.value)} />
          </label>
          {can(user.role, 'cases.assign') && (
            <label className="field">
              <span>Assigned to</span>
              <select id="edit-assignee" className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                {OFFICERS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      ) : (
        <div className="callout">
          <b>Read only</b>
          This case is assigned to {name(c.assigneeId)}.
        </div>
      )}

      {mayEdit && (
        <label className="field" style={{ marginTop: 12 }}>
          <span>Add a note</span>
          <textarea id="edit-note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened, what's next" />
        </label>
      )}
      {blocked && (
        <div className="callout crit" style={{ marginTop: 8 }}>
          <b>Remove the ID number from the note</b>
          It's already on the student's record.
        </div>
      )}

      <h3 style={{ margin: '18px 0 10px' }}>History</h3>
      <ol className="timeline">
        {[...c.history].reverse().map((h, i) => (
          <li key={i}>
            {h.text}
            <div className="small muted">
              {name(h.by)} · {fmtDateTime(h.at)}
            </div>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
