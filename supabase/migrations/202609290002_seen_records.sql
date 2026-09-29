begin;
alter table public.personal_records add column seen_at timestamptz;
update public.personal_records set seen_at=coalesce(last_opened_at,rated_at);

create or replace function public.apply_record_ops(p_user_id uuid,p_ops jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); op jsonb; card jsonb; accepted uuid; stamp timestamptz; amount bigint; kind text; opinion text;
begin
  if uid is null or uid is distinct from p_user_id then raise exception 'Wrong account' using errcode='42501';end if;
  if jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops) not between 1 and 100 then raise exception 'Invalid operations';end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  for op in select value from jsonb_array_elements(p_ops) loop
    card:=op->'card';kind:=op->>'kind';opinion:=op->>'reaction';
    if kind is null or kind not in ('open','rate','import','seen') or jsonb_typeof(card) is distinct from 'object' or coalesce(card->>'id','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(card->>'id')>100 then raise exception 'Invalid operation';end if;
    if coalesce(jsonb_typeof(card->'title'),'')<>'string' or length(card->>'title')>12000 or coalesce(jsonb_typeof(card->'topic'),'')<>'string' or coalesce(jsonb_typeof(card->'parent'),'')<>'string' or coalesce(card->>'version','') !~ '^[1-9][0-9]*$' then raise exception 'Invalid metadata';end if;
    if kind in ('rate','import') and (not op ? 'reaction' or (op->'reaction'<>'null'::jsonb and coalesce(opinion,'') not in ('like','dislike'))) then raise exception 'Invalid reaction';end if;
    if kind='import' and (coalesce(op->>'opens','') !~ '^[0-9]+$' or (op->>'opens')::numeric>9007199254740991) then raise exception 'Invalid import count';end if;
    accepted:=null;
    insert into public.record_operations(user_id,op_id) values(uid,(op->>'op_id')::uuid) on conflict do nothing returning op_id into accepted;
    if accepted is null then continue;end if;
    stamp:=clock_timestamp();
    insert into public.personal_records(user_id,card_id,metadata) values(uid,card->>'id',card) on conflict do nothing;
    update public.personal_records set metadata=card,updated_at=stamp,seen_at=coalesce(seen_at,case when kind='import' then coalesce((op->>'seenAt')::timestamptz,(op->>'lastOpenedAt')::timestamptz,(op->>'ratedAt')::timestamptz) else coalesce((op->>'at')::timestamptz,stamp) end) where user_id=uid and card_id=card->>'id';
    if kind='open' then
      update public.personal_records set opens=opens+1,last_opened_at=stamp where user_id=uid and card_id=card->>'id';
    elsif kind='rate' then
      update public.personal_records set reaction=opinion,rated_at=stamp where user_id=uid and card_id=card->>'id';
    elsif kind='seen' then
      null;
    else
      amount:=(op->>'opens')::bigint;
      update public.personal_records set opens=opens+amount,
        last_opened_at=greatest(last_opened_at,(op->>'lastOpenedAt')::timestamptz),
        reaction=case when rated_at is null and op->>'ratedAt' is not null then opinion else reaction end,
        rated_at=coalesce(rated_at,(op->>'ratedAt')::timestamptz)
        where user_id=uid and card_id=card->>'id';
    end if;
  end loop;
  return coalesce((select jsonb_agg(to_jsonb(r) order by card_id) from public.personal_records r where user_id=uid),'[]'::jsonb);
end;
$$;
revoke all on function public.apply_record_ops(uuid,jsonb) from public,anon;
grant execute on function public.apply_record_ops(uuid,jsonb) to authenticated;
commit;
