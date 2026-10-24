create or replace function public.msg_toggle_reaction(p_msg_id uuid, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur jsonb;
  users jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (
    select 1 from msg_messages m join msg_conversations c on c.id = m.conv_id
    where m.id = p_msg_id and uid = any(c.participant_ids)
  ) then raise exception 'not a participant'; end if;
  select coalesce(reactions, '{}'::jsonb) into cur from msg_messages where id = p_msg_id for update;
  users := coalesce(cur -> p_emoji, '[]'::jsonb);
  if users ? uid::text then
    users := coalesce((select jsonb_agg(v) from jsonb_array_elements_text(users) v where v <> uid::text), '[]'::jsonb);
  else
    users := users || to_jsonb(uid::text);
  end if;
  if jsonb_array_length(users) = 0 then cur := cur - p_emoji; else cur := jsonb_set(cur, array[p_emoji], users); end if;
  update msg_messages set reactions = cur where id = p_msg_id;
  return cur;
end $$;
revoke all on function public.msg_toggle_reaction(uuid, text) from public, anon;
grant execute on function public.msg_toggle_reaction(uuid, text) to authenticated;
