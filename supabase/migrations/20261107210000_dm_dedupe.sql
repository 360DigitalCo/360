create temp table _dm_keep as
with ranked as (
  select d.id,
         least(d.user_a, d.user_b) as a,
         greatest(d.user_a, d.user_b) as b,
         row_number() over (
           partition by least(d.user_a, d.user_b), greatest(d.user_a, d.user_b)
           order by (select count(*) from dm_messages m where m.dm_id = d.id) desc, d.updated_at desc
         ) as rn
  from direct_messages d
  where d.user_a is not null and d.user_b is not null and coalesce(d.is_group, false) = false
)
select r.id as dup_id, k.id as keep_id
from ranked r
join ranked k on k.a = r.a and k.b = r.b and k.rn = 1
where r.rn > 1;

update dm_messages m set dm_id = k.keep_id from _dm_keep k where m.dm_id = k.dup_id;
update pinned_messages p set dm_id = k.keep_id from _dm_keep k where p.dm_id = k.dup_id;
update polls p set dm_id = k.keep_id from _dm_keep k where p.dm_id = k.dup_id;
delete from direct_messages d using _dm_keep k where d.id = k.dup_id;

create unique index if not exists direct_messages_pair_uniq
  on direct_messages (least(user_a, user_b), greatest(user_a, user_b))
  where user_a is not null and user_b is not null and coalesce(is_group, false) = false;

create or replace function public.get_or_create_dm(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  found uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_other is null or p_other = me then raise exception 'invalid user'; end if;
  select id into found from direct_messages
    where coalesce(is_group, false) = false
      and least(user_a, user_b) = least(me, p_other)
      and greatest(user_a, user_b) = greatest(me, p_other)
    limit 1;
  if found is null then
    begin
      insert into direct_messages (user_a, user_b, created_by) values (me, p_other, me) returning id into found;
    exception when unique_violation then
      select id into found from direct_messages
        where coalesce(is_group, false) = false
          and least(user_a, user_b) = least(me, p_other)
          and greatest(user_a, user_b) = greatest(me, p_other)
        limit 1;
    end;
  end if;
  insert into dm_participants (dm_id, user_id)
    select found, u from unnest(array[me, p_other]) as u
    where not exists (select 1 from dm_participants x where x.dm_id = found and x.user_id = u);
  return found;
end;
$$;
revoke all on function public.get_or_create_dm(uuid) from public, anon;
grant execute on function public.get_or_create_dm(uuid) to authenticated;

drop table if exists _dm_keep;
