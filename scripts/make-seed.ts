// Generates supabase/seed.sql from the synthetic data generator.
// Run: npm run seed:sql   (dates are written relative to current_date, so the demo never goes stale)
import { writeFileSync } from 'node:fs';
import { generateSeed, USERS } from '../src/data/seed';

export const DEMO_PASSWORD = 'Student360-demo!';

const userUuid = (id: string) => `00000000-0000-4000-a000-${id.replace('u', '').padStart(12, '0')}`;
const studentUuid = (id: string) => `00000000-0000-4000-b000-${id.replace('s', '').padStart(12, '0')}`;
const q = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? 'null' : `'${v.replace(/'/g, "''")}'`);
const email = (name: string, role: string) => `${name.split(' ')[0].toLowerCase()}.${role}@example.com`;

const today = new Date();
const dayOffset = (iso: string) => Math.round((new Date(iso.slice(0, 10)).getTime() - new Date(today.toISOString().slice(0, 10)).getTime()) / 86400000);
const rel = (iso: string) => `current_date + ${dayOffset(iso)}`;

const { students, cases } = generateSeed(today);
const out: string[] = [];

out.push(`-- Student360 synthetic seed. Safe to re-run: it wipes demo data first.
-- Demo users (password for all: ${DEMO_PASSWORD})
${USERS.map((u) => `--   ${email(u.name, u.role)}  (${u.role})`).join('\n')}

begin;
set local app.demo_tamper = 'on';
delete from public.audit_log;
delete from public.case_events;
delete from public.cases;
delete from public.students;
delete from public.profiles;
delete from auth.identities where user_id::text like '00000000-0000-4000-a000-%';
delete from auth.users where id::text like '00000000-0000-4000-a000-%';
`);

for (const u of USERS) {
  const id = userUuid(u.id);
  const em = email(u.name, u.role);
  out.push(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', '${em}',
  extensions.crypt('${DEMO_PASSWORD}', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":${JSON.stringify(u.name)}}', now(), now(), '', '', '', '');
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '${id}', '${id}', '{"sub":"${id}","email":"${em}","email_verified":true}', 'email', now(), now(), now());
insert into public.profiles (id, full_name, role) values ('${id}', ${q(u.name)}, '${u.role}');
`);
}

out.push(`insert into public.students (id, first_name, last_name, id_number, student_number, institution, qualification,
  year_of_study, funding_status, cellphone, email, verified, created_at) values`);
out.push(
  students
    .map(
      (s) =>
        `('${studentUuid(s.id)}', ${q(s.firstName)}, ${q(s.lastName)}, '${s.idNumber}', '${s.studentNumber}', ${q(s.institution)}, ${q(s.qualification)}, ${s.yearOfStudy}, '${s.fundingStatus}', ${q(s.cellphone)}, ${q(s.email)}, ${s.verified}, ${rel(s.createdAt)})`,
    )
    .join(',\n') + '\non conflict (institution, student_number) do nothing;\n',
);

out.push(`insert into public.cases (id, student_id, type, status, priority, assignee_id, follow_up, created_at) values`);
out.push(
  cases
    .map(
      (c) =>
        `('${c.id}', '${studentUuid(c.studentId)}', ${q(c.type)}, '${c.status}', '${c.priority}', '${userUuid(c.assigneeId)}', ${rel(c.followUp)}, now() - interval '${-dayOffset(c.createdAt)} days')`,
    )
    .join(',\n') + ';\n',
);
out.push(`insert into public.case_events (case_id, by, at, text)
select id, assignee_id, created_at, 'Case opened: ' || type from public.cases;
select setval('public.case_number_seq', (select max(substr(id, 3)::int) from public.cases));

select public._audit('data_reset', 'demo', 'Synthetic demo data seeded');
commit;
`);

writeFileSync('supabase/seed.sql', out.join('\n'));
console.log(`seed.sql: ${USERS.length} users, ${students.length} students, ${cases.length} cases`);
