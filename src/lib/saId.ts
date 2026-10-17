// South African ID number: YYMMDD SSSS C A Z
//  - YYMMDD date of birth, SSSS gender sequence (0000–4999 female, 5000–9999 male)
//  - C citizenship (0 citizen, 1 permanent resident), A (historic, usually 8), Z Luhn check digit.

export function luhnCheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    let d = Number(first12[11 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

export interface IdCheck {
  valid: boolean;
  problem?: string;
  dob?: Date;
}

export function validateSaId(raw: string, today = new Date()): IdCheck {
  const id = raw.replace(/\s/g, '');
  if (!/^\d{13}$/.test(id)) return { valid: false, problem: 'ID number must be 13 digits' };
  const yy = Number(id.slice(0, 2));
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  const century = 2000 + yy > today.getFullYear() ? 1900 : 2000;
  const dob = new Date(Date.UTC(century + yy, mm - 1, dd));
  if (dob.getUTCMonth() !== mm - 1 || dob.getUTCDate() !== dd)
    return { valid: false, problem: 'Date of birth in ID is not a real date' };
  if (!['0', '1'].includes(id[10])) return { valid: false, problem: 'Citizenship digit must be 0 or 1' };
  if (luhnCheckDigit(id.slice(0, 12)) !== Number(id[12]))
    return { valid: false, problem: 'Check digit does not match (likely a typo)' };
  return { valid: true, dob };
}

export function makeSaId(dob: Date, female: boolean, seq: number): string {
  const yy = String(dob.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(dob.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dob.getUTCDate()).padStart(2, '0');
  const g = String((female ? 0 : 5000) + (seq % 5000)).padStart(4, '0');
  const first12 = `${yy}${mm}${dd}${g}08`;
  return first12 + luhnCheckDigit(first12);
}

// Free-text guard: catches a 13-digit number (spaces allowed) pasted into notes.
export const hasIdNumber = (text: string) => /(?:\d[\s-]?){12}\d/.test(text);
