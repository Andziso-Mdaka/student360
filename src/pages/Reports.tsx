import { useMemo, useState } from 'react';
import { isOverdue, useStore } from '../data/store';
import { INSTITUTIONS } from '../data/seed';
import { crossTab, fmtCell, SUPPRESS_BELOW } from '../lib/report';
import { toCsv } from '../lib/csv';
import { useNav } from '../App';

type ReportKey = 'cases' | 'funding' | 'overdue';

const REPORTS: Record<ReportKey, { title: string; cols: string[] }> = {
  cases: { title: 'Unresolved cases by institution and status', cols: ['Open', 'In progress', 'Awaiting student', 'Escalated'] },
  funding: { title: 'Students by institution and funding status', cols: ['Funded', 'Pending', 'Appeal', 'Unfunded'] },
  overdue: { title: 'Overdue cases by institution and type', cols: ['Allowance not received', 'Registration confirmation', 'Funding appeal', 'Document verification', 'Bank details update', 'Academic progress review'] },
};

export default function Reports() {
  const { students, cases, log } = useStore();
  const { toast } = useNav();
  const [key, setKey] = useState<ReportKey>('cases');
  const [suppress, setSuppress] = useState(true);

  const table = useMemo(() => {
    const instOf = new Map(students.map((s) => [s.id, s.institution]));
    const cols = REPORTS[key].cols;
    if (key === 'funding') return crossTab(students, (s) => s.institution, (s) => s.fundingStatus, INSTITUTIONS, cols);
    const pool = key === 'cases' ? cases.filter((c) => c.status !== 'Resolved') : cases.filter(isOverdue);
    return crossTab(pool, (c) => instOf.get(c.studentId) ?? '', (c) => (key === 'cases' ? c.status : c.type), INSTITUTIONS, cols);
  }, [key, students, cases]);

  const show = (c: { value: number; suppressed: boolean }) => (suppress ? fmtCell(c) : String(c.value));
  const suppressedCount = table.cells.flat().filter((c) => c.suppressed).length;

  const exportCsv = () => {
    const { cols } = REPORTS[key];
    const csv = toCsv([
      ['Institution', ...cols, 'Total'],
      ...INSTITUTIONS.map((inst, i) => [inst, ...table.cells[i].map(fmtCell), fmtCell(table.rowTotals[i])]),
      [],
      [`Counts below ${SUPPRESS_BELOW} are suppressed. Generated ${new Date().toISOString()} by Student360.`],
    ]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `student360-${key}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    log('report_export', key, `${REPORTS[key].title} exported (suppressed below ${SUPPRESS_BELOW})`);
    toast('Report exported and logged');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Reports</span>
          <h1>Aggregate reports</h1>
          <p>
            Reports contain counts only, never names or ID numbers. Small counts are hidden so nobody can be singled out from a report that gets
            forwarded.
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div className="toolbar">
            <select className="select" value={key} onChange={(e) => setKey(e.target.value as ReportKey)} aria-label="Report">
              {(Object.keys(REPORTS) as ReportKey[]).map((k) => (
                <option key={k} value={k}>
                  {REPORTS[k].title}
                </option>
              ))}
            </select>
            <label className="toolbar small">
              <input id="suppress" type="checkbox" checked={suppress} onChange={(e) => setSuppress(e.target.checked)} />
              Preview with small-count suppression
            </label>
          </div>
          <button className="btn primary" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Institution</th>
                {REPORTS[key].cols.map((c) => (
                  <th key={c} className="num">
                    {c}
                  </th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {INSTITUTIONS.map((inst, i) => (
                <tr key={inst}>
                  <td>{inst}</td>
                  {table.cells[i].map((c, j) => (
                    <td key={j} className="num" style={suppress && c.suppressed ? { color: 'var(--muted)' } : undefined}>
                      {show(c)}
                    </td>
                  ))}
                  <td className="num" style={{ fontWeight: 600 }}>
                    {show(table.rowTotals[i])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="callout">
        <b>How suppression works</b>
        {suppressedCount} cells have a count between 1 and {SUPPRESS_BELOW - 1} and show as “&lt;{SUPPRESS_BELOW}”. When a row has exactly one hidden
        cell, its total is hidden too, otherwise the hidden number could be worked out by subtraction. Exports always apply suppression; the
        toggle only changes this preview.
      </div>
    </div>
  );
}
