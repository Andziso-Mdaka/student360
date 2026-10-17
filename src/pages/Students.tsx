import { useEffect, useMemo, useState } from 'react';
import { isIncomplete, useStore } from '../data/store';
import { INSTITUTIONS } from '../data/seed';
import { maskedId } from '../lib/rbac';
import { FundingPill } from '../components/ui';
import { useNav } from '../App';
import type { FundingStatus } from '../data/types';

const PAGE = 25;

export default function Students() {
  const { students, cases, duplicateStudentIds: dups, findByIdNumber } = useStore();
  const { go } = useNav();
  const [q, setQ] = useState('');
  const [inst, setInst] = useState('');
  const [fund, setFund] = useState<FundingStatus | ''>('');
  const [flag, setFlag] = useState<'' | 'incomplete' | 'duplicate'>('');
  const [page, setPage] = useState(0);

  // A full ID number is matched on the server; the browser never holds ID numbers.
  const [idMatches, setIdMatches] = useState<Set<string> | null>(null);
  const digits = q.replace(/\s/g, '');
  const isFullId = /^\d{13}$/.test(digits);
  useEffect(() => {
    if (!isFullId) return setIdMatches(null);
    let live = true;
    findByIdNumber(digits).then((ids) => live && setIdMatches(new Set(ids)), () => live && setIdMatches(new Set()));
    return () => {
      live = false;
    };
  }, [digits, isFullId, findByIdNumber]);
  const openCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cases) if (c.status !== 'Resolved') m.set(c.studentId, (m.get(c.studentId) ?? 0) + 1);
    return m;
  }, [cases]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return students.filter((s) => {
      if (inst && s.institution !== inst) return false;
      if (fund && s.fundingStatus !== fund) return false;
      if (flag === 'incomplete' && !isIncomplete(s)) return false;
      if (flag === 'duplicate' && !dups.has(s.id)) return false;
      if (!term) return true;
      if (isFullId) return idMatches?.has(s.id) ?? false;
      return (
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(term) ||
        s.studentNumber.toLowerCase().includes(term)
      );
    });
  }, [students, q, inst, fund, flag, dups, isFullId, idMatches]);

  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.ceil(rows.length / PAGE);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Students</span>
          <h1>Find a student</h1>
          <p>Search by name, student number, or a full 13-digit ID number. ID numbers stay masked in lists.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div className="toolbar" style={{ flex: 1 }}>
            <input
              id="student-search"
              className="input search"
              placeholder="Name, student number or full ID number"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
            <select className="select" value={inst} onChange={(e) => (setInst(e.target.value), setPage(0))} aria-label="Institution">
              <option value="">All institutions</option>
              {INSTITUTIONS.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
            <select className="select" value={fund} onChange={(e) => (setFund(e.target.value as FundingStatus | ''), setPage(0))} aria-label="Funding status">
              <option value="">Any funding status</option>
              {['Funded', 'Pending', 'Appeal', 'Unfunded'].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            <select className="select" value={flag} onChange={(e) => (setFlag(e.target.value as typeof flag), setPage(0))} aria-label="Data quality">
              <option value="">Any data quality</option>
              <option value="incomplete">Incomplete only</option>
              <option value="duplicate">Possible duplicates</option>
            </select>
          </div>
          <span className="small muted">{rows.length.toLocaleString('en-ZA')} records</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Student no.</th>
                <th>ID number</th>
                <th>Institution</th>
                <th>Funding</th>
                <th className="num">Open cases</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => go({ page: 'student', id: s.id })}>
                  <td>
                    <b>
                      {s.firstName} {s.lastName}
                    </b>
                    <div className="small muted">{s.qualification} · Year {s.yearOfStudy}</div>
                  </td>
                  <td className="mono">{s.studentNumber}</td>
                  <td className="masked">{maskedId(s.idLast4)}</td>
                  <td>{s.institution}</td>
                  <td>
                    <FundingPill status={s.fundingStatus} />
                  </td>
                  <td className="num">{openCount.get(s.id) ?? 0}</td>
                  <td>
                    <div className="toolbar">
                      {dups.has(s.id) && <span className="pill crit">Duplicate?</span>}
                      {(!s.cellphoneMasked || !s.emailMasked) && <span className="pill warn">No contact</span>}
                      {!s.verified && <span className="pill warn">Unverified</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No students match. Partial ID numbers aren't searchable; enter all 13 digits.</div>}
        </div>
        {pages > 1 && (
          <div className="panel-head" style={{ borderTop: '1px solid var(--line)', borderBottom: 0 }}>
            <span className="small muted">
              Page {page + 1} of {pages}
            </span>
            <div className="toolbar">
              <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <button className="btn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
