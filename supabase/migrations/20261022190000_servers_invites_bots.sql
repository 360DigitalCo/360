create table if not exists public.server_secrets (
  server_id uuid primary key,
  passcode text,
  invite_code text unique
);

alter table public.server_secrets drop constraint if exists server_secrets_server_id_fkey;
alter table public.server_secrets
  add constraint server_secrets_server_id_fkey
  foreign key (server_id) references public.servers(id) on delete cascade
  deferrable initially deferred;

alter table public.server_secrets enable row level security;
revoke all on public.server_secrets from anon, authenticated;

insert into public.server_secrets (server_id, passcode, invite_code)
select id, nullif(passcode, ''), permanent_invite_code from public.servers
on conflict (server_id) do update
  set passcode = excluded.passcode,
      invite_code = coalesce(public.server_secrets.invite_code, excluded.invite_code);

update public.server_secrets
set invite_code = upper(substr(md5(server_id::text || clock_timestamp()::text || random()::text), 1, 8))
where invite_code is null;

alter table public.servers alter column has_passcode drop expression;
alter table public.servers alter column has_passcode set default false;

update public.servers s
set has_passcode = exists (
  select 1 from public.server_secrets x where x.server_id = s.id and x.passcode is not null
);
update public.servers set has_passcode = false where has_passcode is null;
alter table public.servers alter column has_passcode set not null;

update public.servers set passcode = null where passcode is not null;
update public.servers set permanent_invite_code = null where permanent_invite_code is not null;

drop trigger if exists on_server_created_invite on public.servers;
drop function if exists public.generate_permanent_invite();

create or replace function public.servers_guard_secrets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.has_passcode := false;
    insert into public.server_secrets (server_id, invite_code)
    values (new.id, upper(substr(md5(new.id::text || clock_timestamp()::text || random()::text), 1, 8)))
    on conflict (server_id) do nothing;
    if new.passcode is not null and new.passcode <> '' then
      update public.server_secrets set passcode = new.passcode where server_id = new.id;
      new.has_passcode := true;
    end if;
  else
    new.has_passcode := old.has_passcode;
    if new.passcode is not null then
      if new.passcode = '' then
        update public.server_secrets set passcode = null where server_id = new.id;
        new.has_passcode := false;
      else
        insert into public.server_secrets (server_id, passcode, invite_code)
        values (new.id, new.passcode, upper(substr(md5(new.id::text || clock_timestamp()::text || random()::text), 1, 8)))
        on conflict (server_id) do update set passcode = excluded.passcode;
        new.has_passcode := true;
      end if;
    end if;
  end if;
  new.passcode := null;
  new.permanent_invite_code := null;
  return new;
end;
$$;

drop trigger if exists servers_guard_secrets on public.servers;
create trigger servers_guard_secrets
  before insert or update on public.servers
  for each row execute function public.servers_guard_secrets();

revoke execute on function public.servers_guard_secrets() from public, anon, authenticated;

create or replace function public.join_server_with_passcode(p_server_id uuid, p_passcode text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from profiles where id = auth.uid() and coalesce(banned, false)) then
    raise exception 'Account is suspended';
  end if;
  perform 1 from servers where id = p_server_id;
  if not found then raise exception 'Server not found'; end if;
  select passcode into v_pass from server_secrets where server_id = p_server_id;
  if v_pass is not null and v_pass <> '' and v_pass is distinct from p_passcode then
    return false;
  end if;
  insert into server_members (server_id, user_id) values (p_server_id, auth.uid())
  on conflict do nothing;
  return true;
end;
$$;

alter table public.server_invites add column if not exists max_uses integer;
alter table public.server_invites add column if not exists uses integer not null default 0;

create index if not exists server_members_user_id_idx on public.server_members (user_id);
create index if not exists servers_public_idx on public.servers (is_public) where is_public;
create index if not exists server_invites_code_upper_idx on public.server_invites (upper(code));
create index if not exists bot_server_installs_server_idx on public.bot_server_installs (server_id);

create or replace function public.get_invite_preview(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_server uuid;
  s record;
begin
  if v_code = '' then return null; end if;
  select i.server_id into v_server
  from server_invites i
  where upper(i.code) = v_code
    and not i.used
    and (i.expires_at is null or i.expires_at > now())
    and (i.max_uses is null or i.uses < i.max_uses)
  limit 1;
  if v_server is null then
    select x.server_id into v_server from server_secrets x where upper(x.invite_code) = v_code;
  end if;
  if v_server is null then return null; end if;
  select * into s from servers where id = v_server;
  if not found then return null; end if;
  return jsonb_build_object(
    'server_id', s.id,
    'name', s.name,
    'description', s.description,
    'icon', s.icon,
    'slug', s.slug,
    'verified', s.verified,
    'rules', s.onboarding_rules,
    'onboarding_enabled', s.onboarding_enabled,
    'member_count', (select count(*) from server_members m where m.server_id = s.id),
    'channels', coalesce((
      select jsonb_agg(c.name) from (
        select name from channels where server_id = s.id and is_public order by position, name limit 5
      ) c
    ), '[]'::jsonb),
    'is_member', coalesce((
      select true from server_members m where m.server_id = s.id and m.user_id = auth.uid()
    ), false)
  );
end;
$$;

create or replace function public.join_server_by_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_inv_id uuid;
  v_server uuid;
  v_rows integer;
  s record;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from profiles where id = v_uid and coalesce(banned, false)) then
    raise exception 'Account is suspended';
  end if;
  select i.id, i.server_id into v_inv_id, v_server
  from server_invites i
  where upper(i.code) = v_code
    and not i.used
    and (i.expires_at is null or i.expires_at > now())
    and (i.max_uses is null or i.uses < i.max_uses)
  limit 1;
  if v_server is null then
    select x.server_id into v_server from server_secrets x where upper(x.invite_code) = v_code;
  end if;
  if v_server is null then raise exception 'Invalid or expired invite'; end if;

  insert into server_members (server_id, user_id) values (v_server, v_uid)
  on conflict do nothing;
  get diagnostics v_rows = row_count;

  if v_rows > 0 and v_inv_id is not null then
    update server_invites
    set uses = uses + 1,
        used = (max_uses is not null and uses + 1 >= max_uses),
        used_by = v_uid
    where id = v_inv_id;
  end if;

  select * into s from servers where id = v_server;
  return jsonb_build_object(
    'server_id', s.id,
    'slug', s.slug,
    'name', s.name,
    'onboarding_required', s.onboarding_enabled and not coalesce((
      select m.onboarding_done from server_members m where m.server_id = s.id and m.user_id = v_uid
    ), false)
  );
end;
$$;

create or replace function public.join_server(p_server_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s record;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from profiles where id = v_uid and coalesce(banned, false)) then
    raise exception 'Account is suspended';
  end if;
  select * into s from servers where id = p_server_id;
  if not found then raise exception 'Server not found'; end if;
  if not s.is_public or s.has_passcode then
    raise exception 'This server requires an invite or passcode';
  end if;
  insert into server_members (server_id, user_id) values (s.id, v_uid) on conflict do nothing;
  return jsonb_build_object(
    'server_id', s.id,
    'slug', s.slug,
    'name', s.name,
    'onboarding_required', s.onboarding_enabled and not coalesce((
      select m.onboarding_done from server_members m where m.server_id = s.id and m.user_id = v_uid
    ), false)
  );
end;
$$;

create or replace function public.create_server(
  p_name text,
  p_description text default null,
  p_icon text default null,
  p_passcode text default null,
  p_is_public boolean default false,
  p_category text default null,
  p_enable_carlos boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid := gen_random_uuid();
  v_slug text;
  v_icon text := nullif(btrim(coalesce(p_icon, '')), '');
  v_carlos uuid := 'eb84ed95-5f72-49a8-9096-73ac6847a620';
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from profiles where id = v_uid and (coalesce(banned, false) or coalesce(account_deleted, false))) then
    raise exception 'Account is suspended';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 32 then
    raise exception 'Server name must be 2 to 32 characters';
  end if;
  if (select count(*) from servers where owner_id = v_uid) >= 20 then
    raise exception 'Server limit reached';
  end if;
  if v_icon is not null
     and not (char_length(v_icon) <= 16
              or v_icon like 'https://wiswfpfsjiowtrdyqpxy.supabase.co/storage/v1/object/public/server-icons/%') then
    raise exception 'Invalid icon';
  end if;
  v_slug := trim(both '-' from lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g')));
  if v_slug = '' then v_slug := 'server'; end if;
  v_slug := v_slug || '-' || left(v_id::text, 6);

  insert into servers (id, name, description, icon, passcode, owner_id, is_public, category, slug)
  values (
    v_id, v_name,
    nullif(left(btrim(coalesce(p_description, '')), 120), ''),
    coalesce(v_icon, '🌐'),
    nullif(p_passcode, ''),
    v_uid,
    coalesce(p_is_public, false),
    nullif(p_category, ''),
    v_slug
  );
  insert into channels (server_id, name, is_public, category, position)
  values (v_id, 'general', true, 'TEXT CHANNELS', 0);
  insert into server_members (server_id, user_id, onboarding_done) values (v_id, v_uid, true);
  if p_enable_carlos and exists (select 1 from bots where id = v_carlos) then
    insert into bot_server_installs (bot_id, server_id, installed_by)
    values (v_carlos, v_id, v_uid) on conflict do nothing;
  end if;
  return jsonb_build_object('id', v_id, 'slug', v_slug, 'name', v_name);
end;
$$;

create or replace function public.complete_onboarding(p_server_id uuid, p_roles text[] default '{}')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r jsonb;
  v_name text;
  v_role uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from server_members where server_id = p_server_id and user_id = v_uid) then
    raise exception 'Not a member of this server';
  end if;
  for r in
    select * from jsonb_array_elements(
      coalesce((select onboarding_roles from servers where id = p_server_id), '[]'::jsonb)
    )
  loop
    v_role := null;
    v_name := coalesce(r->>'name', r->>'id');
    continue when v_name is null or not (v_name = any (coalesce(p_roles, '{}')));
    select id into v_role from server_roles
    where server_id = p_server_id and lower(name) = lower(v_name) limit 1;
    if v_role is null then
      insert into server_roles (server_id, name, color, position)
      values (p_server_id, left(v_name, 32), coalesce(r->>'color', '#99aab5'), 0)
      returning id into v_role;
    end if;
    insert into server_member_roles (server_id, user_id, role_id)
    values (p_server_id, v_uid, v_role) on conflict do nothing;
  end loop;
  update server_members set onboarding_done = true
  where server_id = p_server_id and user_id = v_uid;
end;
$$;

create or replace function public.discover_servers(
  p_query text default null,
  p_category text default null,
  p_limit integer default 60,
  p_offset integer default 0
)
returns table (
  id uuid, name text, description text, icon text, category text, slug text,
  verified boolean, featured boolean, member_count bigint, has_passcode boolean, is_member boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select s.id, s.name, s.description, s.icon, s.category, s.slug,
           s.verified, s.featured,
           (select count(*) from server_members m where m.server_id = s.id) as member_count,
           s.has_passcode,
           exists (select 1 from server_members m where m.server_id = s.id and m.user_id = auth.uid()) as is_member
    from servers s
    where s.is_public
      and (coalesce(p_category, '') = '' or s.category = p_category)
      and (coalesce(p_query, '') = ''
           or s.name ilike '%' || p_query || '%'
           or coalesce(s.description, '') ilike '%' || p_query || '%')
  ) t
  order by t.featured desc, t.verified desc, t.member_count desc, t.name
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

alter table public.bots add column if not exists bot_user_id uuid references auth.users(id) on delete set null;
alter table public.bots add column if not exists is_public boolean not null default true;
alter table public.bots add column if not exists prefix text not null default '!';
alter table public.bots add column if not exists updated_at timestamptz not null default now();

create table if not exists public.bot_credentials (
  bot_id uuid primary key references public.bots(id) on delete cascade,
  token_hash text not null,
  rotated_at timestamptz not null default now()
);
alter table public.bot_credentials enable row level security;
revoke all on public.bot_credentials from anon, authenticated;

drop policy if exists bots_own on public.bots;
drop policy if exists bots_owner_update on public.bots;
create policy bots_owner_update on public.bots
  for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

revoke insert, update, delete on public.bots from anon, authenticated;
grant update (name, description, avatar_url, website_url, category, is_public, prefix)
  on public.bots to authenticated;

drop policy if exists bsi_insert on public.bot_server_installs;
create policy bsi_insert on public.bot_server_installs
  for insert to authenticated
  with check (
    auth.uid() = installed_by
    and exists (
      select 1 from public.servers s
      where s.id = server_id and (s.owner_id = auth.uid() or public._is_admin(auth.uid()))
    )
  );

create or replace function public.install_bot(p_bot_id uuid, p_server_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  b record;
  v_rows integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (
    select 1 from servers where id = p_server_id and (owner_id = v_uid or _is_admin(v_uid))
  ) then
    raise exception 'Only the server owner can add bots';
  end if;
  select * into b from bots where id = p_bot_id;
  if not found then raise exception 'Bot not found'; end if;
  if not b.is_public and b.owner_id <> v_uid then raise exception 'This bot is private'; end if;
  insert into bot_server_installs (bot_id, server_id, installed_by)
  values (p_bot_id, p_server_id, v_uid) on conflict (bot_id, server_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    update bots set install_count = install_count + 1 where id = p_bot_id;
  end if;
  if b.bot_user_id is not null then
    insert into server_members (server_id, user_id, onboarding_done)
    values (p_server_id, b.bot_user_id, true) on conflict do nothing;
  end if;
end;
$$;

create or replace function public.uninstall_bot(p_bot_id uuid, p_server_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  b record;
  v_rows integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (
    select 1 from servers where id = p_server_id and (owner_id = v_uid or _is_admin(v_uid))
  ) then
    raise exception 'Only the server owner can remove bots';
  end if;
  select * into b from bots where id = p_bot_id;
  delete from bot_server_installs where bot_id = p_bot_id and server_id = p_server_id;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    update bots set install_count = greatest(install_count - 1, 0) where id = p_bot_id;
  end if;
  if b.bot_user_id is not null then
    delete from server_members where server_id = p_server_id and user_id = b.bot_user_id;
  end if;
end;
$$;

revoke execute on function public.get_invite_preview(text) from public;
revoke execute on function public.discover_servers(text, text, integer, integer) from public;
revoke execute on function public.join_server_by_invite(text) from public, anon;
revoke execute on function public.join_server(uuid) from public, anon;
revoke execute on function public.create_server(text, text, text, text, boolean, text, boolean) from public, anon;
revoke execute on function public.complete_onboarding(uuid, text[]) from public, anon;
revoke execute on function public.install_bot(uuid, uuid) from public, anon;
revoke execute on function public.uninstall_bot(uuid, uuid) from public, anon;
revoke execute on function public.join_server_with_passcode(uuid, text) from public, anon;

grant execute on function public.get_invite_preview(text) to anon, authenticated;
grant execute on function public.discover_servers(text, text, integer, integer) to anon, authenticated;
grant execute on function public.join_server_by_invite(text) to authenticated;
grant execute on function public.join_server(uuid) to authenticated;
grant execute on function public.create_server(text, text, text, text, boolean, text, boolean) to authenticated;
grant execute on function public.complete_onboarding(uuid, text[]) to authenticated;
grant execute on function public.install_bot(uuid, uuid) to authenticated;
grant execute on function public.uninstall_bot(uuid, uuid) to authenticated;
grant execute on function public.join_server_with_passcode(uuid, text) to authenticated;

drop policy if exists bots_read on public.bots;
create policy bots_read on public.bots for select
  using (is_public or owner_id = auth.uid());
