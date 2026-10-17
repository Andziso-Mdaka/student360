import { PERMISSION_LABEL, ROLE_LABEL, can, type Permission } from '../lib/rbac';
import type { Role } from '../data/types';

const ROLES: Role[] = ['officer', 'manager', 'admin'];

// Status is honest about what the prototype does vs. what the production build still needs.
const SAFEGUARDS: { area: string; item: string; status: 'Prototype' | 'MVP' | 'Client process' }[] = [
  { area: 'Minimise', item: 'Import drops columns the purpose doesn\'t need (income, health, race, etc.)', status: 'Prototype' },
  { area: 'Minimise', item: 'Notes refuse 13-digit ID numbers', status: 'Prototype' },
  { area: 'Restrict', item: 'Role-based access with least privilege', status: 'Prototype' },
  { area: 'Restrict', item: 'ID and contact masked; reveal needs a stated purpose and expires after 60s', status: 'Prototype' },
  { area: 'Restrict', item: 'Partial ID searches blocked to prevent fishing', status: 'Prototype' },
  { area: 'Protect', item: 'Reports suppress counts below 5, including back-calculation via totals', status: 'Prototype' },
  { area: 'Protect', item: 'Personal sign-in per staff member; encrypted transport and storage', status: 'Prototype' },
  { area: 'Protect', item: 'MFA, session timeout and South African or approved hosting region', status: 'MVP' },
  { area: 'Protect', item: 'Every permission enforced in the database (Row Level Security + role-checked functions), not just hidden on screen', status: 'Prototype' },
  { area: 'Protect', item: 'Full ID numbers and contact details never sent to the browser unless revealed', status: 'Prototype' },
  { area: 'Trace', item: 'Hash-chained audit log written by the database, append-only, verified server-side', status: 'Prototype' },
  { area: 'Trace', item: 'Monthly audit review and alerts on unusual reveal or export activity', status: 'MVP' },
  { area: 'Govern', item: 'Retention periods, correction requests and breach response procedure', status: 'Client process' },
  { area: 'Validate', item: 'Lawful basis, operator agreement and hosting confirmed with the client\'s information officer', status: 'Client process' },
];

export default function Privacy() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Privacy & access</span>
          <h1>How Student360 handles personal information</h1>
          <p>
            Built to support POPIA alignment. Compliance itself needs a documented assessment and sign-off by the client, so we show what the
            software does and what still sits with people and process.
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Who can do what</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Permission</th>
                {ROLES.map((r) => (
                  <th key={r} style={{ textAlign: 'center' }}>
                    {ROLE_LABEL[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(PERMISSION_LABEL) as Permission[]).map((p) => (
                <tr key={p}>
                  <td>{PERMISSION_LABEL[p]}</td>
                  {ROLES.map((r) => (
                    <td key={r} style={{ textAlign: 'center' }}>
                      {can(r, p) ? <span className="pill ok plain">Yes</span> : <span className="muted">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Safeguards</h2>
          <div className="legend">
            <span><span className="pill ok plain">Prototype</span> working in this demo</span>
            <span><span className="pill accent plain">MVP</span> planned for the build</span>
            <span><span className="pill warn plain">Client process</span> needs the client</span>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Principle</th>
                <th>Safeguard</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {SAFEGUARDS.map((s, i) => (
                <tr key={i}>
                  <td>
                    <b>{s.area}</b>
                  </td>
                  <td>{s.item}</td>
                  <td>
                    <span className={`pill plain ${s.status === 'Prototype' ? 'ok' : s.status === 'MVP' ? 'accent' : 'warn'}`}>{s.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
