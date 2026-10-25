create or replace function public.mark_msg_read(p_conv_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    return;
  end if;
  if not exists (
    select 1 from msg_conversations c
    where c.id = p_conv_id and p_user_id = any (c.participant_ids)
  ) then
    return;
  end if;
  update msg_messages
     set read_by = array_append(read_by, p_user_id)
   where conv_id = p_conv_id
     and not (read_by @> array[p_user_id]);
end;
$$;

revoke all on function public.mark_msg_read(uuid, uuid) from public, anon;
grant execute on function public.mark_msg_read(uuid, uuid) to authenticated;

alter table public.msg_messages replica identity full;
alter table public.msg_conversations replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'msg_messages') then
    alter publication supabase_realtime add table public.msg_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'msg_conversations') then
    alter publication supabase_realtime add table public.msg_conversations;
  end if;
end $$;
