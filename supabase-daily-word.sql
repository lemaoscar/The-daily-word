create table if not exists public.daily_word_vault (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload text not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.daily_word_vault enable row level security;

drop policy if exists "Users can read their own Daily Word vault" on public.daily_word_vault;
create policy "Users can read their own Daily Word vault"
  on public.daily_word_vault
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own Daily Word vault" on public.daily_word_vault;
create policy "Users can delete their own Daily Word vault"
  on public.daily_word_vault
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.daily_word_vault from anon, authenticated;
grant select, delete on table public.daily_word_vault to authenticated;

create or replace function public.save_daily_word_vault(
  p_payload text,
  p_expected_revision bigint
)
returns table (revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_revision bigint;
  new_revision bigint;
  changed_at timestamptz;
  owner_id uuid := auth.uid();
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_payload is null or length(p_payload) > 12582912 then
    raise exception 'Encrypted Daily Word backup is missing or too large' using errcode = '22023';
  end if;

  select vault.revision into current_revision
  from public.daily_word_vault as vault
  where vault.user_id = owner_id
  for update;

  if not found then
    if p_expected_revision is not null then
      raise exception 'Daily Word vault changed on another device' using errcode = '40001';
    end if;
    insert into public.daily_word_vault (user_id, payload, revision, updated_at)
    values (owner_id, p_payload, 1, now())
    returning daily_word_vault.revision, daily_word_vault.updated_at
    into new_revision, changed_at;
  else
    if p_expected_revision is null or p_expected_revision <> current_revision then
      raise exception 'Daily Word vault changed on another device' using errcode = '40001';
    end if;
    update public.daily_word_vault as vault
      set payload = p_payload,
          revision = vault.revision + 1,
          updated_at = now()
      where vault.user_id = owner_id
      returning vault.revision, vault.updated_at
      into new_revision, changed_at;
  end if;

  return query select new_revision, changed_at;
exception
  when unique_violation then
    raise exception 'Daily Word vault changed on another device' using errcode = '40001';
end;
$$;

revoke all on function public.save_daily_word_vault(text, bigint) from public, anon;
grant execute on function public.save_daily_word_vault(text, bigint) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'daily-word-profile-photos',
  'daily-word-profile-photos',
  false,
  52428800,
  array['image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = array['image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];

drop policy if exists "Users can view their own Daily Word profile photo" on storage.objects;
create policy "Users can view their own Daily Word profile photo"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'daily-word-profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can upload their own Daily Word profile photo" on storage.objects;
create policy "Users can upload their own Daily Word profile photo"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'daily-word-profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/profile\.(webp|mp4|webm|mov)$')
  );

drop policy if exists "Users can update their own Daily Word profile photo" on storage.objects;
create policy "Users can update their own Daily Word profile photo"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'daily-word-profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/profile\.(webp|mp4|webm|mov)$')
  )
  with check (
    bucket_id = 'daily-word-profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/profile\.(webp|mp4|webm|mov)$')
  );

drop policy if exists "Users can delete their own Daily Word profile photo" on storage.objects;
create policy "Users can delete their own Daily Word profile photo"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'daily-word-profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/profile\.(webp|mp4|webm|mov)$')
  );
