alter table public.bot_credentials add column if not exists webhook_url text;
alter table public.bot_credentials add column if not exists webhook_secret text;

create or replace function public.dispatch_bot_webhooks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  srv uuid;
  b record;
  t text := coalesce(new.text, '');
begin
  if new.channel_id is null or new.deleted_at is not null or new.thread_id is not null or t = '' then return new; end if;
  if coalesce(new.role, '') = 'bot' or coalesce(new.tag, '') = 'BOT' then return new; end if;
  select server_id into srv from channels where id = new.channel_id;
  if srv is null then return new; end if;
  for b in
    select bt.id, bt.prefix, bt.handle
    from bot_server_installs i
    join bots bt on bt.id = i.bot_id
    join bot_credentials c on c.bot_id = bt.id
    where i.server_id = srv and c.webhook_url is not null and bt.bot_user_id is distinct from new.user_id
  loop
    if left(t, length(coalesce(b.prefix, '!'))) = coalesce(b.prefix, '!')
       or t ~* ('(^|\s)@' || regexp_replace(b.handle, '[^a-z0-9_]', '', 'gi') || '\y') then
      perform net.http_post(
        url := 'https://wiswfpfsjiowtrdyqpxy.supabase.co/functions/v1/bot-dispatch',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('bot_id', b.id, 'message_id', new.id)
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists dispatch_bot_webhooks on public.messages;
create trigger dispatch_bot_webhooks after insert on public.messages
  for each row execute function public.dispatch_bot_webhooks();
