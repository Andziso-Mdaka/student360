-- One-off: rename the demo manager in an existing database without reseeding.
-- (Running seed.sql again also does this, but it resets all demo data.)
begin;
update public.profiles
  set full_name = 'Kagisho Mamabolo'
  where id = '00000000-0000-4000-a000-000000000004';
update auth.users
  set email = 'kagisho.manager@example.com',
      raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'), '{full_name}', '"Kagisho Mamabolo"')
  where id = '00000000-0000-4000-a000-000000000004';
update auth.identities
  set identity_data = jsonb_set(identity_data, '{email}', '"kagisho.manager@example.com"')
  where user_id = '00000000-0000-4000-a000-000000000004';
commit;
