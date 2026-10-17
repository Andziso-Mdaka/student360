// Aggregate reports with small-cell suppression: any count below the threshold is shown as "<5"
// so a report can't be used to single out an individual student. Totals are suppressed too
// when a single suppressed cell could be back-calculated from them.
export const SUPPRESS_BELOW = 5;

export type Cell = { value: number; suppressed: boolean };

export function crossTab<T>(
  items: T[],
  rowKey: (t: T) => string,
  colKey: (t: T) => string,
  rows: string[],
  cols: string[],
) {
  const raw = rows.map((r) => cols.map((c) => items.filter((i) => rowKey(i) === r && colKey(i) === c).length));
  const cells: Cell[][] = raw.map((r) => r.map((v) => ({ value: v, suppressed: v > 0 && v < SUPPRESS_BELOW })));

  // Secondary suppression: if a row has exactly one suppressed cell, the row total would reveal it.
  const rowTotals: Cell[] = raw.map((r, i) => {
    const sup = cells[i].filter((c) => c.suppressed).length;
    const total = r.reduce((a, b) => a + b, 0);
    return { value: total, suppressed: sup === 1 || (total > 0 && total < SUPPRESS_BELOW) };
  });
  return { cells, rowTotals };
}

export const fmtCell = (c: Cell) => (c.suppressed ? `<${SUPPRESS_BELOW}` : String(c.value));
