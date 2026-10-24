create or replace function public.guard_unique_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.username is null or btrim(new.username) = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and lower(new.username) = lower(coalesce(old.username, '')) then
    return new;
  end if;
  if exists (
    select 1 from profiles p
    where lower(p.username) = lower(new.username) and p.id <> new.id
  ) then
    if tg_op = 'INSERT' then
      new.username := left(new.username, 24) || '#' || lpad((floor(random() * 10000))::int::text, 4, '0');
    else
      raise exception 'That username is already taken';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_unique_username on public.profiles;
create trigger profiles_unique_username
before insert or update of username on public.profiles
for each row execute function public.guard_unique_username();

revoke execute on function public.guard_unique_username() from public, anon, authenticated;
