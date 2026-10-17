import { useEffect, type ReactNode } from 'react';
import type { CasePriority, CaseStatus, FundingStatus } from '../data/types';

export function StatusPill({ status, overdue }: { status: CaseStatus; overdue?: boolean }) {
  if (overdue) return <span className="pill crit">Overdue · {status}</span>;
  const tone = status === 'Resolved' ? 'ok' : status === 'Escalated' ? 'crit' : status === 'Awaiting student' ? 'warn' : 'accent';
  return <span className={`pill ${tone}`}>{status}</span>;
}

export function FundingPill({ status }: { status: FundingStatus }) {
  const tone = status === 'Funded' ? 'ok' : status === 'Unfunded' ? 'crit' : 'warn';
  return <span className={`pill ${tone}`}>{status}</span>;
}

export function PriorityTag({ p }: { p: CasePriority }) {
  return <span className={`pill plain ${p === 'High' ? 'crit' : ''}`}>{p}</span>;
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-head">
          <h2>{title}</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <div className="panel-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export interface Segment {
  label: string;
  value: number;
  color: string;
}

export function StackedBars({ rows, max }: { rows: { label: string; segs: Segment[] }[]; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.segs.reduce((a, s) => a + s.value, 0)));
  return (
    <div className="bars">
      {rows.map((r) => {
        const total = r.segs.reduce((a, s) => a + s.value, 0);
        return (
          <div className="bar-row" key={r.label}>
            <span className="lbl" title={r.label}>{r.label}</span>
            <div className="bar-track" role="img" aria-label={`${r.label}: ${r.segs.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
              {r.segs.map((s) => (
                <div key={s.label} className="bar-seg" style={{ width: `${(s.value / top) * 100}%`, background: s.color }} title={`${s.label}: ${s.value}`} />
              ))}
            </div>
            <span className="mono" style={{ textAlign: 'right' }}>{total}</span>
          </div>
        );
      })}
    </div>
  );
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
