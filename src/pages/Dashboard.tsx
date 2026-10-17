import { useMemo, useState } from 'react';
import { daysBetween, isIncomplete, isOverdue, todayIso, useStore } from '../data/store';
import { INSTITUTIONS, OFFICERS } from '../data/seed';
import { StackedBars } from '../components/ui';
import { useNav } from '../App';

const STATUS_COLORS = {
  Open: 'var(--accent)',
  'In progress': 'var(--info)',
  'Awaiting student': 'var(--warn)',
  Escalated: 'var(--crit)',
} as const;

export default function Dashboard() {
  const { students, cases, users, duplicateStudentIds } = useStore();
  const { go } = useNav();
  const [inst, setInst] = useState('');

  const data = useMemo(() => {
    const sById = new Map(students.map((s) => [s.id, s]));
    const scoped = inst ? cases.filter((c) => sById.get(c.studentId)?.institution === inst) : cases;
    const scopedStudents = inst ? students.filter((s) => s.institution === inst) : students;
    const open = scoped.filter((c) => c.status !== 'Resolved');
    const overdue = open.filter(isOverdue).sort((a, b) => a.followUp.localeCompare(b.followUp));
    const dueSoon = open.filter((c) => !isOverdue(c) && daysBetween(todayIso(), c.followUp) <= 2);
    const incomplete = scopedStudents.filter(isIncomplete);
    const dups = scopedStudents.filter((s) => duplicateStudentIds.has(s.id));
    return { sById, open, overdue, dueSoon, incomplete, dups, scopedStudents };
  }, [students, cases, inst, duplicateStudentIds]);

  const byInstitution = (inst ? [inst] : INSTITUTIONS).map((i) => ({
    label: i,
    segs: (Object.keys(STATUS_COLORS) as (keyof typeof STATUS_COLORS)[]).map((st) => ({
      label: st,
      value: data.open.filter((c) => c.status === st && data.sById.get(c.studentId)?.institution === i).length,
      color: STATUS_COLORS[st],
    })),
  }));

  const workload = OFFICERS.map((o) => {
    const mine = data.open.filter((c) => c.assigneeId === o.id);
    const od = mine.filter(isOverdue).length;
    return {
      label: o.name,
      segs: [
        { label: 'Overdue', value: od, color: 'var(--crit)' },
        { label: 'On track', value: mine.length - od, color: 'var(--accent)' },
      ],
    };
  });

  const missingContact = data.incomplete.filter((s) => !s.cellphoneMasked || !s.emailMasked).length;
  const unverified = data.scopedStudents.filter((s) => !s.verified).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Operations overview</span>
          <h1>What needs attention today</h1>
          <p>Counts update as officers work cases. Click any figure to see the records behind it.</p>
        </div>
        <select className="select" value={inst} onChange={(e) => setInst(e.target.value)} aria-label="Filter by institution">
          <option value="">All institutions</option>
          {INSTITUTIONS.map((i) => (
            <option key={i}>{i}</option>
          ))}
        </select>
      </div>

      <div className="kpis">
        <button className="kpi" onClick={() => go({ page: 'students' })}>
          <span className="eyebrow">Student records</span>
          <span className="v">{data.scopedStudents.length.toLocaleString('en-ZA')}</span>
          <span className="note">{data.dups.length} records may be duplicates</span>
        </button>
        <button className="kpi" onClick={() => go({ page: 'cases' })}>
          <span className="eyebrow">Open cases</span>
          <span className="v">{data.open.length}</span>
          <span className="note">{data.dueSoon.length} due in the next 2 days</span>
        </button>
        <button className="kpi crit" onClick={() => go({ page: 'cases', overdueOnly: true })}>
          <span className="eyebrow">Overdue</span>
          <span className="v">{data.overdue.length}</span>
          <span className="note">past their follow-up date</span>
        </button>
        <button className="kpi warn" onClick={() => go({ page: 'students' })}>
          <span className="eyebrow">Incomplete records</span>
          <span className="v">{data.incomplete.length}</span>
          <span className="note">missing contact or unverified</span>
        </button>
      </div>

      <div className="grid g-3-1">
        <section className="panel">
          <div className="panel-head">
            <h2>Open cases by institution</h2>
            <div className="legend">
              {Object.entries(STATUS_COLORS).map(([k, c]) => (
                <span key={k}>
                  <i style={{ background: c }} />
                  {k}
                </span>
              ))}
            </div>
          </div>
          <div className="panel-body">
            <StackedBars rows={byInstitution} />
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Priority queue</h2>
            <button className="btn ghost" onClick={() => go({ page: 'cases', overdueOnly: true })}>
              All overdue
            </button>
          </div>
          {data.overdue.length === 0 ? (
            <div className="empty">Nothing overdue. Good work.</div>
          ) : (
            <ul className="queue">
              {data.overdue.slice(0, 7).map((c) => {
                const s = data.sById.get(c.studentId);
                const late = daysBetween(c.followUp, todayIso());
                return (
                  <li key={c.id} onClick={() => go({ page: 'cases', caseId: c.id })}>
                    <span className={`stripe ${late < 3 ? 'warn' : ''}`} />
                    <span style={{ minWidth: 0 }}>
                      <b>{c.type}</b>
                      <div className="small muted">
                        <span className="mono">{c.id}</span> · {s?.firstName} {s?.lastName[0]}. · {users.find((u) => u.id === c.assigneeId)?.name}
                      </div>
                    </span>
                    <span className="pill crit plain mono">{late}d late</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="grid g-2">
        <section className="panel">
          <div className="panel-head">
            <h2>Officer workload</h2>
            <div className="legend">
              <span><i style={{ background: 'var(--crit)' }} />Overdue</span>
              <span><i style={{ background: 'var(--accent)' }} />On track</span>
            </div>
          </div>
          <div className="panel-body">
            <StackedBars rows={workload} />
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Data quality</h2>
          </div>
          <div className="panel-body">
            <table>
              <tbody>
                <tr>
                  <td>Records sharing an ID number with another</td>
                  <td className="num">{data.dups.length}</td>
                </tr>
                <tr>
                  <td>Missing cellphone or email</td>
                  <td className="num">{missingContact}</td>
                </tr>
                <tr>
                  <td>Identity not yet verified</td>
                  <td className="num">{unverified}</td>
                </tr>
                <tr>
                  <td>Records passing all checks</td>
                  <td className="num">
                    {Math.round(((data.scopedStudents.length - data.incomplete.length) / Math.max(1, data.scopedStudents.length)) * 100)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
