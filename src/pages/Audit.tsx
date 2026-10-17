import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNav } from '../App';
import { fmtDateTime } from '../components/ui';
import { ROLE_LABEL } from '../lib/rbac';
import type { AuditAction } from '../data/types';

const ACTION_LABEL: Record<AuditAction, string> = {
  login: 'Signed in',
  view_record: 'Viewed record',
  reveal_field: 'Revealed field',
  case_create: 'Opened case',
  case_update: 'Updated case',
  case_assign: 'Reassigned case',
  import_preview: 'Checked import file',
  import_commit: 'Imported students',
  report_export: 'Exported report',
  data_reset: 'Seeded demo data',
};

export default function Audit() {
  const { audit, users, tamperDemo, verifyChain } = useStore();
  const { toast } = useNav();
  const [action, setAction] = useState<AuditAction | ''>('');
  const [who, setWho] = useState('');
  const [check, setCheck] = useState<Awaited<ReturnType<typeof verifyChain>> | null>(null);
  const [busy, setBusy] = useState(false);
  const runCheck = async () => {
    setBusy(true);
    try {
      setCheck(await verifyChain());
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const tamper = async (undo: boolean) => {
    setBusy(true);
    try {
      await tamperDemo(undo);
      setCheck(null);
      toast(undo ? 'Entry #2 restored' : 'Entry #2 was edited behind the app’s back. Now verify the chain.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(
    () => [...audit].reverse().filter((e) => (!action || e.action === action) && (!who || e.userId === who)),
    [audit, action, who],
  );
  const name = (id: string | null) => {
    const u = users.find((x) => x.id === id);
    return u ? `${u.name} (${ROLE_LABEL[u.role]})` : 'System';
  };
  const reveals = audit.filter((e) => e.action === 'reveal_field').length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Audit log</span>
          <h1>Who did what, and when</h1>
          <p>
            Each entry carries a fingerprint of the one before it. If anyone edits or deletes an old entry, the chain breaks and verification
            shows exactly where.
          </p>
        </div>
        <div className="toolbar">
          <button className="btn primary" disabled={busy} onClick={runCheck}>
            {busy ? 'Checking…' : 'Verify chain'}
          </button>
        </div>
      </div>

      {check &&
        (check.ok ? (
          <div className="callout">
            <b>Chain intact</b>
            All {check.total} entries match their fingerprints. The database checked this, not your browser.
          </div>
        ) : (
          <div className="callout crit">
            <b>Chain broken at entry #{check.brokenAt}</b>
            That entry was changed after it was written. In production this raises an incident for the information officer.
          </div>
        ))}

      <section className="panel">
        <div className="panel-head">
          <div className="toolbar">
            <select className="select" value={action} onChange={(e) => setAction(e.target.value as AuditAction | '')} aria-label="Action">
              <option value="">All actions</option>
              {Object.entries(ACTION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select className="select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="User">
              <option value="">Everyone</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <span className="small muted">
            {audit.length} entries · {reveals} field reveals
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">#</th>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Detail</th>
                <th>Fingerprint</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((e) => (
                <tr key={e.seq}>
                  <td className="num">{e.seq}</td>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.at)}</td>
                  <td>{name(e.userId)}</td>
                  <td>
                    <span className={`pill plain ${e.action === 'reveal_field' || e.action === 'report_export' ? 'warn' : ''}`}>{ACTION_LABEL[e.action]}</span>
                  </td>
                  <td className="small">{e.detail}</td>
                  <td className="hash" title={e.hash}>
                    {e.hash.slice(0, 10)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No entries match.</div>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Demo controls</h2>
        </div>
        <div className="panel-body toolbar">
          <button className="btn" disabled={busy} onClick={() => tamper(false)}>
            Simulate someone editing entry #2
          </button>
          <button className="btn" disabled={busy} onClick={() => tamper(true)}>
            Undo the edit
          </button>
          <span className="small muted">Only works in this demo: a database switch lets the demo function bypass the append-only rule.</span>
        </div>
      </section>
    </div>
  );
}
