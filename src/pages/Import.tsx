import { useState } from 'react';
import { useStore } from '../data/store';
import { parseCsv, toCsv } from '../lib/csv';
import { checkImport, conflictQuery, IMPORT_COLUMNS, SAMPLE_CSV, type ImportReport } from '../lib/importCheck';
import { maskedId } from '../lib/rbac';
import { useNav } from '../App';

export default function ImportPage() {
  const { importConflicts, importStudents, log } = useStore();
  const { toast } = useNav();
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [over, setOver] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (name: string, text: string) => {
    setBusy(true);
    setError(null);
    try {
      const table = parseCsv(text);
      const q = conflictQuery(table);
      const conflicts = await importConflicts(q.ids, q.keys);
      const r = checkImport(table, conflicts);
      setFileName(name);
      setReport(r);
      setDone(null);
      const bad = r.rows.filter((x) => !x.payload).length;
      await log('import_preview', name, `${r.rows.length} rows checked, ${bad} with errors`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const readFile = (f: File) => {
    if (!/\.csv$/i.test(f.name)) {
      toast('Save the spreadsheet as CSV first (File → Save As → CSV)');
      return;
    }
    f.text().then((t) => run(f.name, t));
  };

  const valid = report?.rows.filter((r) => r.payload) ?? [];
  const invalid = report?.rows.filter((r) => !r.payload) ?? [];
  const warnings = report?.rows.reduce((n, r) => n + r.issues.filter((i) => i.severity === 'warning').length, 0) ?? 0;

  const downloadErrors = () => {
    if (!report) return;
    const csv = toCsv([
      ['line', 'field', 'problem'],
      ...invalid.flatMap((r) => r.issues.filter((i) => i.severity === 'error').map((i) => [r.line, i.field, i.message])),
    ]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${fileName.replace(/\.csv$/i, '')}-errors.csv`;
    a.click();
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Import data</span>
          <h1>Bring in a file from an institution</h1>
          <p>
            Every row is checked before anything is saved. Rows with errors stay out; you get a list of what to fix and send back.
          </p>
        </div>
      </div>

      {error && (
        <div className="callout crit">
          <b>Couldn't check the file</b>
          {error}
        </div>
      )}

      {!report && (
        <section className="panel">
          <div className="panel-body">
            <div
              className={`dropzone ${over ? 'over' : ''}`}
              onDragOver={(e) => (e.preventDefault(), setOver(true))}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                const f = e.dataTransfer.files[0];
                if (f) readFile(f);
              }}
            >
              <b>Drop a CSV file here</b>
              <span className="small muted">Expected columns: {IMPORT_COLUMNS.join(', ')}</span>
              <div className="toolbar" style={{ justifyContent: 'center' }}>
                <label className="btn">
                  Choose file
                  <input id="import-file" type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
                </label>
                <button className="btn primary" disabled={busy} onClick={() => run('sample-institution-upload.csv', SAMPLE_CSV)}>
                  {busy ? 'Checking…' : 'Try the sample file'}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {report && (
        <>
          <div className="kpis">
            <div className="kpi">
              <span className="eyebrow">Rows in file</span>
              <span className="v">{report.rows.length}</span>
              <span className="note mono">{fileName}</span>
            </div>
            <div className="kpi">
              <span className="eyebrow">Ready to import</span>
              <span className="v" style={{ color: 'var(--ok)' }}>{valid.length}</span>
              <span className="note">{warnings} warnings to review</span>
            </div>
            <div className="kpi crit">
              <span className="eyebrow">Rows with errors</span>
              <span className="v">{invalid.length}</span>
              <span className="note">will not be imported</span>
            </div>
            <div className="kpi warn">
              <span className="eyebrow">Columns dropped</span>
              <span className="v">{report.droppedColumns.length}</span>
              <span className="note">not needed for this purpose</span>
            </div>
          </div>

          {report.droppedColumns.length > 0 && (
            <div className="callout warn">
              <b>Collecting only what we need</b>
              The file included <span className="mono">{report.droppedColumns.join(', ')}</span>. Student360 doesn't need it to manage cases, so it was
              discarded and never stored.
            </div>
          )}
          {report.missingColumns.length > 0 && (
            <div className="callout crit">
              <b>Missing columns</b>
              Add <span className="mono">{report.missingColumns.join(', ')}</span> and upload the file again.
            </div>
          )}
          {done && (
            <div className="callout">
              <b>Import complete</b>
              {done}
            </div>
          )}

          <section className="panel">
            <div className="panel-head">
              <h2>Row-by-row check</h2>
              <div className="toolbar">
                <button className="btn" onClick={() => (setReport(null), setDone(null))}>
                  Start over
                </button>
                <button className="btn" disabled={!invalid.length} onClick={downloadErrors}>
                  Download error list
                </button>
                <button
                  className="btn primary"
                  disabled={!valid.length || !!done || busy || report.missingColumns.length > 0}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const res = await importStudents(valid.map((r) => r.payload!), fileName);
                      const left = invalid.length + res.rejected;
                      setDone(`${res.imported} students added. ${left} rows were left out; download the error list to send back.`);
                      toast(`${res.imported} students imported`);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Import {valid.length} valid rows
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="num">Line</th>
                    <th>Name</th>
                    <th>ID number</th>
                    <th>Institution</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.line}>
                      <td className="num">{r.line}</td>
                      <td>
                        {r.values.first_name} {r.values.last_name}
                      </td>
                      <td className="masked">{r.values.id_number ? maskedId(r.values.id_number.replace(/\s/g, '').slice(-4)) : '—'}</td>
                      <td>{r.values.institution}</td>
                      <td>
                        {r.issues.length === 0 ? (
                          <span className="pill ok">Ready</span>
                        ) : (
                          <>
                            <span className={`pill ${r.payload ? 'warn' : 'crit'}`}>{r.payload ? 'Ready, with warnings' : 'Rejected'}</span>
                            <ul className="issue-list">
                              {r.issues.map((i, k) => (
                                <li key={k} className={i.severity}>
                                  <span className="mono">{i.field}</span>: {i.message}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
