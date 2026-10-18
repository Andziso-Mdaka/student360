# Student360 — prototype

Secure student data management for an NSFAS-style case workflow (Mdaka Advanced Technologies).
**Synthetic data only.** No real student records belong in this repo or in a demo.

## Set up the database (Supabase)
1. Supabase dashboard → **SQL Editor** → paste and run `supabase/migrations/0001_student360.sql` (once).
2. Then paste and run `supabase/seed.sql`. It creates the demo users and synthetic data. Safe to re-run any time to reset the demo (dates are relative to the day you run it).
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key (already done in this zip).

To regenerate the seed after changing `src/data/seed.ts`: `npm run seed:sql`.

## Run it
```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build in dist/
```

Demo accounts (password `Student360-demo!`, also one-click on the sign-in page):
`thandi.officer@example.com` · `lebo.officer@example.com` · `sipho.officer@example.com` · `kagisho.manager@example.com` · `ayanda.admin@example.com`

## Demo journeys (from the pitch deck)
1. **Case officer** (Thandi / Lebo / Sipho): Students → search → open record → *Reveal* ID with a stated purpose (60 s, logged) → *Open a case* with follow-up date. "Cases" shows only your own work, overdue first.
2. **Manager** (Kagisho): Operations overview → filter by institution → priority queue of overdue cases → reassign a case → Reports → export an aggregate CSV.
3. **Administrator** (Ayanda): Import data → *Try the sample file* → see validation errors, in-file duplicates, dropped columns → import valid rows → Audit log → *Verify chain* (try *Simulate someone editing entry #2* first).

## What Excel can't do (the differentiators)
| Feature | Where |
|---|---|
| Field-level masking; reveal needs a purpose, auto re-masks, and is logged | `pages/StudentDetail.tsx`, `lib/rbac.ts` |
| Role-based access (least privilege) | `lib/rbac.ts` |
| SA ID validation: Luhn check digit, real birth date, citizenship digit | `lib/saId.ts` |
| Import gate: validation, duplicate detection (vs. DB and within file), "did you mean" institution, unneeded columns discarded | `lib/importCheck.ts` |
| Overdue/SLA tracking and priority queue computed live | `pages/Dashboard.tsx`, `pages/Cases.tsx` |
| Reports with small-count suppression (<5), incl. back-calculation via totals | `lib/report.ts` |
| Tamper-evident audit log (SHA-256 hash chain) | `data/store.tsx`, `pages/Audit.tsx` |
| Notes refuse pasted ID numbers | `lib/saId.ts` → `hasIdNumber` |

## Architecture
- **React + TypeScript (Vite)** front end, **Supabase (Postgres)** back end.
- **Reads** use Row Level Security and column privileges: the API can't return a full ID number, cellphone or email at all, only masked copies.
- **Writes** never touch tables directly. They go through SQL functions (`create_case`, `update_case`, `reveal_student_field`, `import_students`, …) that check the caller's role and write the audit log in the same transaction.
- **Audit log** is append-only (a trigger blocks edits and deletes) and SHA-256 hash-chained; `verify_audit_chain()` checks it on the server.
- `src/data/store.tsx` is the only file that talks to Supabase.

## Next steps (suggested)
- MFA and session timeout in Supabase Auth; remove the demo accounts list before a pilot
- Per-institution row filtering (an officer only sees their institutions)
- Confirm hosting region with the client (Supabase has no South African region)
- Retention rules and a correction-request workflow
- Student-facing status page (students see their own case status without calling)
