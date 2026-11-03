create or replace function public.delete_message(p_id bigint, p_dm boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner uuid;
  staff boolean;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select exists(select 1 from profiles where id = uid and role in ('admin','mod')) into staff;
  if p_dm then
    select user_id into owner from dm_messages where id = p_id;
    if owner is null then raise exception 'message not found'; end if;
    if owner <> uid and not staff then raise exception 'not allowed'; end if;
    delete from dm_messages where id = p_id;
  else
    select user_id into owner from messages where id = p_id and deleted_at is null;
    if owner is null then raise exception 'message not found'; end if;
    if owner <> uid and not staff then raise exception 'not allowed'; end if;
    update messages set deleted_at = now() where id = p_id;
  end if;
end;
$$;
revoke all on function public.delete_message(bigint, boolean) from public, anon;
grant execute on function public.delete_message(bigint, boolean) to authenticated;
