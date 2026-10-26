create table if not exists public.signup_ip_log (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists signup_ip_log_ip_idx on public.signup_ip_log (ip_hash, created_at desc);
alter table public.signup_ip_log enable row level security;

create or replace function public.is_profane(t text) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  raw text := lower(coalesce(t, ''));
  squashed text := regexp_replace(translate(raw, '01345789@$!', 'oieastbgasi'), '[^a-z]', '', 'g');
  tok text;
begin
  if squashed ~ '(fuck|shit|bitch|cunt|nigg|fagg|whore|slut|asshole|dickhead|pussy|cocksuck|motherfuck|bastard|wank|twat|retard|rapist|jackass|dumbass|bullshit)' then
    return true;
  end if;
  foreach tok in array regexp_split_to_array(raw, '[^a-z]+') loop
    if tok in ('ass','arse','dick','cock','penis','vagina','porn','sex','rape','fag','anus','tits','tit','boobs','cum','jizz','hoe','damn','crap','piss','nazi','dildo','blowjob','handjob','milf') then
      return true;
    end if;
  end loop;
  return false;
end $$;

create or replace function public.check_signup(p_ip_hash text, p_username text, p_first text, p_last text, p_birthdate text)
returns text language plpgsql security definer set search_path = public as $$
declare
  dob date;
  yrs int;
begin
  begin dob := p_birthdate::date; exception when others then dob := null; end;
  if dob is null then return 'Enter a valid birthdate.'; end if;
  if dob > current_date or dob < date '1900-01-01' then return 'Enter a valid birthdate.'; end if;
  yrs := date_part('year', age(current_date, dob));
  if yrs < 13 then return 'You must be 13 or older to create a 360ID.'; end if;
  if public.is_profane(p_username) or public.is_profane(p_first) or public.is_profane(p_last) then
    return 'That name is not allowed. Pick one without profanity.';
  end if;
  if exists (select 1 from signup_ip_log where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') then
    return 'An account was already created from this network in the last hour. Try again later.';
  end if;
  return null;
end $$;

create or replace function public.record_signup(p_ip_hash text) returns void
language sql security definer set search_path = public as $$
  insert into signup_ip_log (ip_hash) values (p_ip_hash);
  delete from signup_ip_log where created_at < now() - interval '2 days';
$$;

revoke all on function public.check_signup(text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.record_signup(text) from public, anon, authenticated;
grant execute on function public.check_signup(text,text,text,text,text) to service_role;
grant execute on function public.record_signup(text) to service_role;

create or replace function public.guard_auth_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  dob date;
begin
  if coalesce(new.raw_app_meta_data->>'provider', 'email') <> 'email' then return new; end if;
  if public.is_profane(m->>'username') or public.is_profane(m->>'first_name') or public.is_profane(m->>'last_name') then
    raise exception 'That name is not allowed';
  end if;
  if coalesce(m->>'birthdate', '') <> '' then
    begin dob := (m->>'birthdate')::date; exception when others then raise exception 'Invalid birthdate'; end;
    if date_part('year', age(current_date, dob)) < 13 then raise exception 'You must be 13 or older'; end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_auth_signup on auth.users;
create trigger guard_auth_signup before insert on auth.users for each row execute function public.guard_auth_signup();

create or replace function public.guard_profile_names() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.username is distinct from old.username then
    if public.is_profane(new.username) then raise exception 'That username is not allowed'; end if;
  end if;
  if tg_op = 'INSERT' or new.display_name is distinct from old.display_name then
    if public.is_profane(new.display_name) then raise exception 'That display name is not allowed'; end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_names on public.profiles;
create trigger guard_profile_names before insert or update on public.profiles for each row execute function public.guard_profile_names();
