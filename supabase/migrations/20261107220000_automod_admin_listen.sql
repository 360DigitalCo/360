update public.profiles set role = 'admin' where id = '0fd9511a-0c05-48f2-bc48-000169cdb449';

create table if not exists public.automod_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  table_name text not null,
  event text not null,
  row_id text,
  actor uuid,
  suspicious boolean not null default false,
  changes jsonb
);
alter table public.automod_audit enable row level security;
drop policy if exists automod_audit_admin_read on public.automod_audit;
create policy automod_audit_admin_read on public.automod_audit for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create or replace function public.automod_diff(o jsonb, n jsonb, cols text[])
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(c, jsonb_build_object('old', o -> c, 'new', n -> c))
         filter (where (o -> c) is distinct from (n -> c)), '{}'::jsonb)
  from unnest(cols) c;
$$;

create or replace function public.automod_watch_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb;
begin
  if tg_op = 'DELETE' then
    insert into automod_audit (table_name, event, row_id, actor, changes)
    values ('messages', 'delete', old.id::text, auth.uid(),
            jsonb_build_object('user_id', old.user_id, 'text', left(coalesce(old.text, ''), 500), 'channel_id', old.channel_id, 'server_id', old.server_id));
    return old;
  end if;
  d := automod_diff(to_jsonb(old), to_jsonb(new), array['text', 'deleted_at']);
  if d = '{}'::jsonb then return new; end if;
  insert into automod_audit (table_name, event, row_id, actor, suspicious, changes)
  values ('messages', 'update', new.id::text, auth.uid(),
          auth.uid() is not null and auth.uid() is distinct from new.user_id and not exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'mod')),
          d);
  if (d ? 'text') and new.deleted_at is null and new.user_id <> '0fd9511a-0c05-48f2-bc48-000169cdb449'::uuid
     and coalesce(trim(new.text), '') <> '' and new.thread_id is null and coalesce(new.tag, '') <> 'BOT' then
    perform net.http_post(
      url := 'https://wiswfpfsjiowtrdyqpxy.supabase.co/functions/v1/automod',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('type', 'UPDATE', 'record', to_jsonb(new), 'source_table', 'messages')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists automod_watch_messages on public.messages;
create trigger automod_watch_messages after update or delete on public.messages
  for each row execute function public.automod_watch_messages();

create or replace function public.automod_watch_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb;
  actor_admin boolean;
begin
  if tg_op = 'DELETE' then
    insert into automod_audit (table_name, event, row_id, actor, changes)
    values ('profiles', 'delete', old.id::text, auth.uid(), jsonb_build_object('username', old.username, 'role', old.role));
    return old;
  end if;
  d := automod_diff(to_jsonb(old), to_jsonb(new),
    array['role', 'banned', 'muted_until', 'username', 'display_name', 'avatar_url', 'warn_count', 'is_bot']);
  if d = '{}'::jsonb then return new; end if;
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'mod')) into actor_admin;
  insert into automod_audit (table_name, event, row_id, actor, suspicious, changes)
  values ('profiles', 'update', new.id::text, auth.uid(),
          auth.uid() is not null and not actor_admin and (d ? 'role' or d ? 'banned' or d ? 'muted_until' or d ? 'warn_count' or d ? 'is_bot') and auth.uid() is distinct from new.id
          or (auth.uid() is not null and auth.uid() = new.id and not actor_admin and (d ? 'role' or d ? 'banned' or d ? 'warn_count' or d ? 'is_bot')),
          d);
  return new;
end;
$$;

drop trigger if exists automod_watch_profiles on public.profiles;
create trigger automod_watch_profiles after update or delete on public.profiles
  for each row execute function public.automod_watch_profiles();
