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
    if current_setting('automod.skip', true) = '1' then return old; end if;
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

create or replace function public.prune_owner_bot_messages(p_keep interval default interval '2 hours')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
  c integer;
begin
  perform set_config('automod.skip', '1', true);
  delete from messages m using profiles p
    where m.user_id = p.id and p.username in ('zakibot_bot', 'mingzebot_bot', 'danbot_bot')
      and m.created_at < now() - p_keep;
  get diagnostics c = row_count;
  n := n + c;
  delete from dm_messages m using profiles p
    where m.user_id = p.id and p.username in ('zakibot_bot', 'mingzebot_bot', 'danbot_bot')
      and m.created_at < now() - p_keep;
  get diagnostics c = row_count;
  return n + c;
end;
$$;
revoke all on function public.prune_owner_bot_messages(interval) from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('prune-owner-bot-messages');
exception when others then null;
end $$;
select cron.schedule('prune-owner-bot-messages', '*/15 * * * *', $$select public.prune_owner_bot_messages()$$);
