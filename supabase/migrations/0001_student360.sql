-- Student360 schema for Supabase (Postgres 15+).
-- Run once in the Supabase SQL editor, then run supabase/seed.sql.
--
-- Security model
--  * Reads: Row Level Security + column privileges. Nobody can SELECT a full ID number,
--    cellphone or email from the API; only masked versions are exposed.
--  * Writes: no direct INSERT/UPDATE/DELETE from the API. Every change goes through a
--    SECURITY DEFINER function that checks the caller's role and writes the audit log.
--  * Audit log: append-only, SHA-256 hash chain, verified server-side.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- types
create type public.app_role as enum ('officer', 'manager', 'admin');
create type public.funding_status as enum ('Funded', 'Pending', 'Appeal', 'Unfunded');
create type public.case_status as enum ('Open', 'In progress', 'Awaiting student', 'Escalated', 'Resolved');
create type public.case_priority as enum ('Low', 'Normal', 'High');

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role public.app_role not null
);

create function public.my_role() returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

-- ---------------------------------------------------------------- helpers
-- SA ID: YYMMDD SSSS C A Z, Z = Luhn check digit.
create function public.sa_id_problem(p text) returns text
language plpgsql immutable set search_path = public
as $$
declare
  s int := 0; d int; i int; yy int; mm int; dd int; yr int;
begin
  if coalesce(p, '') !~ '^\d{13}$' then return 'ID number must be 13 digits'; end if;
  yy := substr(p, 1, 2)::int; mm := substr(p, 3, 2)::int; dd := substr(p, 5, 2)::int;
  yr := case when 2000 + yy > extract(year from current_date) then 1900 + yy else 2000 + yy end;
  if mm < 1 or mm > 12 or dd < 1 then return 'Date of birth in ID is not a real date'; end if;
  if dd > extract(day from (make_date(yr, mm, 1) + interval '1 month - 1 day')) then
    return 'Date of birth in ID is not a real date';
  end if;
  if substr(p, 11, 1) not in ('0', '1') then return 'Citizenship digit must be 0 or 1'; end if;
  for i in 0..11 loop
    d := substr(p, 12 - i, 1)::int;
    if i % 2 = 0 then d := d * 2; if d > 9 then d := d - 9; end if; end if;
    s := s + d;
  end loop;
  if (10 - s % 10) % 10 <> substr(p, 13, 1)::int then return 'Check digit does not match (likely a typo)'; end if;
  return null;
end $$;

-- ---------------------------------------------------------------- students
create table public.students (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  id_number text not null check (id_number ~ '^\d{13}$'),
  student_number text not null,
  institution text not null,
  qualification text not null default '—',
  year_of_study int not null check (year_of_study between 1 and 7),
  funding_status public.funding_status not null,
  cellphone text,
  email text,
  verified boolean not null default false,
  created_at date not null default current_date,
  -- Masked copies are the only versions the API can read.
  id_last4 text generated always as (right(id_number, 4)) stored,
  cellphone_masked text generated always as (
    case when coalesce(cellphone, '') = '' then null else left(cellphone, 3) || ' ••• ' || right(cellphone, 2) end
  ) stored,
  email_masked text generated always as (
    case when coalesce(email, '') = '' then null else left(email, 1) || '•••@' || split_part(email, '@', 2) end
  ) stored,
  unique (institution, student_number)
);
create index students_id_number_idx on public.students (id_number);

-- ---------------------------------------------------------------- cases
create sequence public.case_number_seq start 24100;

create table public.cases (
  id text primary key default 'C-' || nextval('public.case_number_seq'),
  student_id uuid not null references public.students (id) on delete cascade,
  type text not null check (type in (
    'Allowance not received', 'Registration confirmation', 'Funding appeal',
    'Document verification', 'Bank details update', 'Academic progress review')),
  status public.case_status not null default 'Open',
  priority public.case_priority not null default 'Normal',
  assignee_id uuid not null references public.profiles (id),
  follow_up date not null,
  created_at timestamptz not null default now()
);
create index cases_assignee_idx on public.cases (assignee_id);
create index cases_student_idx on public.cases (student_id);

create table public.case_events (
  id bigserial primary key,
  case_id text not null references public.cases (id) on delete cascade,
  at timestamptz not null default now(),
  by uuid references public.profiles (id),
  text text not null check (text !~ '(\d[\s-]?){12}\d') -- no ID numbers in notes
);
create index case_events_case_idx on public.case_events (case_id);

-- ---------------------------------------------------------------- audit log
create table public.audit_log (
  seq bigint primary key,
  at timestamptz not null default now(),
  user_id uuid,
  action text not null,
  target text not null,
  detail text not null default '',
  prev_hash text not null,
  hash text not null
);

create function public.audit_hash(p_seq bigint, p_at timestamptz, p_user uuid, p_action text, p_target text, p_detail text, p_prev text)
returns text language sql immutable set search_path = public, extensions
as $$
  select encode(extensions.digest(
    p_seq::text || '|' || to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
    coalesce(p_user::text, 'system') || '|' || p_action || '|' || p_target || '|' || p_detail || '|' || p_prev,
    'sha256'), 'hex')
$$;

-- Internal: append one event. Not callable from the API.
create function public._audit(p_action text, p_target text, p_detail text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_prev public.audit_log;
  v_seq bigint;
  v_at timestamptz := clock_timestamp();
  v_prev_hash text;
begin
  perform pg_advisory_xact_lock(360360); -- one writer at a time keeps the chain linear
  select * into v_prev from public.audit_log order by seq desc limit 1;
  v_seq := coalesce(v_prev.seq, 0) + 1;
  v_prev_hash := coalesce(v_prev.hash, repeat('0', 64));
  insert into public.audit_log (seq, at, user_id, action, target, detail, prev_hash, hash)
  values (v_seq, v_at, auth.uid(), p_action, p_target, coalesce(p_detail, ''), v_prev_hash,
          public.audit_hash(v_seq, v_at, auth.uid(), p_action, p_target, coalesce(p_detail, ''), v_prev_hash));
end $$;

-- Append-only: block edits and deletes (the tamper demo flips a transaction-local switch).
create function public._audit_block_changes() returns trigger language plpgsql set search_path = public
as $$
begin
  if current_setting('app.demo_tamper', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'audit_log is append-only';
end $$;
create trigger audit_log_append_only before update or delete on public.audit_log
for each row execute function public._audit_block_changes();

-- ---------------------------------------------------------------- privileges
revoke all on public.profiles, public.students, public.cases, public.case_events, public.audit_log from anon, authenticated;
revoke all on function public._audit(text, text, text) from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant select (id, first_name, last_name, id_last4, student_number, institution, qualification, year_of_study,
              funding_status, cellphone_masked, email_masked, verified, created_at)
  on public.students to authenticated;
grant select on public.cases, public.case_events, public.audit_log to authenticated;

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.cases enable row level security;
alter table public.case_events enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (true);

create policy students_read on public.students for select to authenticated
  using ((select public.my_role()) in ('officer', 'manager'));

-- Officers see their own cases; managers see all.
create policy cases_read on public.cases for select to authenticated
  using ((select public.my_role()) = 'manager' or assignee_id = (select auth.uid()));

create policy case_events_read on public.case_events for select to authenticated
  using (exists (select 1 from public.cases c where c.id = case_id));

create policy audit_read on public.audit_log for select to authenticated
  using ((select public.my_role()) = 'admin');

-- ---------------------------------------------------------------- API functions
create function public.require_role(variadic p_roles public.app_role[]) returns public.app_role
language plpgsql stable security definer set search_path = public
as $$
declare r public.app_role := public.my_role();
begin
  if r is null or not (r = any (p_roles)) then
    raise exception 'Your role is not allowed to do this' using errcode = '42501';
  end if;
  return r;
end $$;

-- Client-originated events. Server-side actions log themselves.
create function public.log_event(p_action text, p_target text, p_detail text default '')
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_action = 'login' then null;
  elsif p_action = 'view_record' then perform public.require_role('officer', 'manager');
  elsif p_action = 'import_preview' then perform public.require_role('admin');
  elsif p_action = 'report_export' then perform public.require_role('manager');
  else raise exception 'Unknown action %', p_action;
  end if;
  perform public._audit(p_action, left(p_target, 200), left(p_detail, 500));
end $$;

create function public.duplicate_student_ids() returns setof uuid
language sql stable security definer set search_path = public
as $$
  select s.id from public.students s
  where public.my_role() in ('officer', 'manager')
    and s.id_number in (select id_number from public.students group by id_number having count(*) > 1)
$$;

-- Returns null when the ID is valid, otherwise the problem. Officers and managers can't see the ID itself.
create function public.student_id_problem(p_student uuid) returns text
language sql stable security definer set search_path = public
as $$
  select public.sa_id_problem(id_number) from public.students
  where id = p_student and public.my_role() in ('officer', 'manager')
$$;

-- Exact match on a full ID number (partial searches aren't possible: the column isn't readable).
create function public.find_students_by_id_number(p_id text) returns setof uuid
language sql stable security definer set search_path = public
as $$
  select id from public.students
  where id_number = regexp_replace(p_id, '\s', '', 'g') and public.my_role() in ('officer', 'manager')
$$;

create function public.reveal_student_field(p_student uuid, p_field text, p_reason text)
returns text language plpgsql security definer set search_path = public
as $$
declare v text; s public.students;
begin
  perform public.require_role('officer');
  if p_reason not in (
    'Verifying identity with the student on a call',
    'Matching a document the student submitted',
    'Contacting the student about an open case') then
    raise exception 'Choose one of the listed reasons';
  end if;
  select * into s from public.students where id = p_student;
  if not found then raise exception 'Student not found'; end if;
  v := case p_field when 'id_number' then s.id_number when 'cellphone' then s.cellphone when 'email' then s.email end;
  if p_field not in ('id_number', 'cellphone', 'email') then raise exception 'Unknown field'; end if;
  perform public._audit('reveal_field', p_student::text,
    case p_field when 'id_number' then 'ID number' when 'cellphone' then 'Cellphone' else 'Email' end
    || ' revealed — ' || p_reason);
  return v;
end $$;

create function public.create_case(p_student uuid, p_type text, p_priority public.case_priority, p_follow_up date, p_note text default '')
returns text language plpgsql security definer set search_path = public
as $$
declare v_id text;
begin
  perform public.require_role('officer');
  insert into public.cases (student_id, type, priority, assignee_id, follow_up)
  values (p_student, p_type, p_priority, auth.uid(), p_follow_up)
  returning id into v_id;
  insert into public.case_events (case_id, by, text)
  values (v_id, auth.uid(), 'Case opened: ' || p_type || coalesce(' — ' || nullif(trim(p_note), ''), ''));
  perform public._audit('case_create', v_id, p_type || ' for ' || p_student::text);
  return v_id;
end $$;

create function public.update_case(p_case text, p_status public.case_status, p_follow_up date, p_assignee uuid, p_note text default '')
returns void language plpgsql security definer set search_path = public
as $$
declare
  c public.cases;
  r public.app_role := public.require_role('officer', 'manager');
  parts text[] := '{}';
  v_name text;
begin
  select * into c from public.cases where id = p_case for update;
  if not found then raise exception 'Case not found'; end if;
  if r = 'officer' and c.assignee_id <> auth.uid() then
    raise exception 'This case is assigned to someone else' using errcode = '42501';
  end if;
  if p_assignee <> c.assignee_id and r <> 'manager' then
    raise exception 'Only managers can reassign cases' using errcode = '42501';
  end if;
  if p_assignee <> c.assignee_id and not exists (select 1 from public.profiles where id = p_assignee and role = 'officer') then
    raise exception 'Cases can only be assigned to case officers';
  end if;

  if p_status <> c.status then parts := parts || format('Status %s → %s', c.status, p_status); end if;
  if p_follow_up <> c.follow_up then parts := parts || format('Follow-up moved to %s', to_char(p_follow_up, 'DD Mon YYYY')); end if;
  if p_assignee <> c.assignee_id then
    select full_name into v_name from public.profiles where id = p_assignee;
    parts := parts || format('Reassigned to %s', v_name);
  end if;
  if coalesce(trim(p_note), '') <> '' then parts := parts || trim(p_note); end if;
  if cardinality(parts) = 0 then return; end if;

  update public.cases set status = p_status, follow_up = p_follow_up, assignee_id = p_assignee where id = p_case;
  insert into public.case_events (case_id, by, text) values (p_case, auth.uid(), array_to_string(parts, '. '));
  perform public._audit(case when p_assignee <> c.assignee_id then 'case_assign' else 'case_update' end,
                        p_case, array_to_string(parts, '. '));
end $$;

-- Import: admins can't read students, so duplicates are checked here.
create function public.import_conflicts(p_ids text[], p_keys text[])
returns table (value text, kind text) language sql stable security definer set search_path = public
as $$
  select id_number, 'id' from public.students
    where id_number = any (p_ids) and public.my_role() = 'admin'
  union all
  select institution || '|' || student_number, 'student_number' from public.students
    where institution || '|' || student_number = any (p_keys) and public.my_role() = 'admin'
$$;

create function public.import_students(p_rows jsonb, p_file text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  r jsonb; ok int := 0; bad int := 0;
begin
  perform public.require_role('admin');
  for r in select * from jsonb_array_elements(p_rows) loop
    -- Re-check on the server; never trust the browser.
    if public.sa_id_problem(r ->> 'id_number') is not null
       or exists (select 1 from public.students where id_number = r ->> 'id_number')
       or exists (select 1 from public.students where institution = r ->> 'institution' and student_number = r ->> 'student_number') then
      bad := bad + 1;
      continue;
    end if;
    begin
    insert into public.students (first_name, last_name, id_number, student_number, institution, qualification,
                                 year_of_study, funding_status, cellphone, email, verified)
    values (r ->> 'first_name', r ->> 'last_name', r ->> 'id_number', r ->> 'student_number', r ->> 'institution',
            coalesce(nullif(r ->> 'qualification', ''), '—'), (r ->> 'year_of_study')::int,
            (r ->> 'funding_status')::public.funding_status, nullif(r ->> 'cellphone', ''), nullif(r ->> 'email', ''), false);
    ok := ok + 1;
    exception when others then bad := bad + 1; -- bad enum, missing field, etc.
    end;
  end loop;
  perform public._audit('import_commit', 'students', format('%s: %s imported, %s rejected', p_file, ok, bad));
  return jsonb_build_object('imported', ok, 'rejected', bad);
end $$;

create function public.verify_audit_chain()
returns table (ok boolean, broken_at bigint, total bigint)
language plpgsql stable security definer set search_path = public
as $$
declare e public.audit_log; prev text := repeat('0', 64); n bigint := 0;
begin
  perform public.require_role('admin');
  for e in select * from public.audit_log order by seq loop
    n := n + 1;
    if e.prev_hash <> prev or public.audit_hash(e.seq, e.at, e.user_id, e.action, e.target, e.detail, e.prev_hash) <> e.hash then
      return query select false, e.seq, n; return;
    end if;
    prev := e.hash;
  end loop;
  return query select true, null::bigint, n;
end $$;

-- Demo only: quietly edit entry #2 so "Verify chain" can catch it, and undo it afterwards.
create function public.demo_tamper_audit(p_undo boolean default false)
returns void language plpgsql security definer set search_path = public
as $$
begin
  perform public.require_role('admin');
  perform set_config('app.demo_tamper', 'on', true);
  if p_undo then
    update public.audit_log set detail = regexp_replace(detail, ' \(edited\)$', '') where seq = 2;
  else
    update public.audit_log set detail = detail || ' (edited)' where seq = 2 and detail !~ ' \(edited\)$';
  end if;
end $$;

-- Only these functions are callable from the app.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.my_role(), public.log_event(text, text, text), public.duplicate_student_ids(),
  public.student_id_problem(uuid), public.find_students_by_id_number(text), public.reveal_student_field(uuid, text, text),
  public.create_case(uuid, text, public.case_priority, date, text),
  public.update_case(text, public.case_status, date, uuid, text),
  public.import_conflicts(text[], text[]), public.import_students(jsonb, text),
  public.verify_audit_chain(), public.demo_tamper_audit(boolean)
to authenticated;
