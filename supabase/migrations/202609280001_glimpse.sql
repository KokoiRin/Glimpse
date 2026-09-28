begin;

create table public.cards (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id)<=100),
  version integer not null check (version>0),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  published boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.personal_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  metadata jsonb not null,
  opens bigint not null default 0 check(opens>=0),
  reaction text check(reaction in ('like','dislike')),
  last_opened_at timestamptz,
  rated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(user_id,card_id)
);
create table public.record_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  op_id uuid not null,
  accepted_at timestamptz not null default now(),
  primary key(user_id,op_id)
);
alter table public.cards enable row level security;
alter table public.personal_records enable row level security;
alter table public.record_operations enable row level security;
revoke all on public.cards,public.personal_records,public.record_operations from anon,authenticated;
grant select on public.cards to anon,authenticated;
grant select on public.personal_records to authenticated;
create policy published_cards on public.cards for select to anon,authenticated using(published);
create policy own_records on public.personal_records for select to authenticated using(user_id=(select auth.uid()));

-- A single transaction validates and publishes the whole batch; only the offline publisher can invoke it.
create function public.publish_card_batch(p_batch jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c jsonb; target_id text; old public.cards%rowtype; keys text[]; item text; ids text[]:='{}'; v integer;
begin
  if jsonb_typeof(p_batch->'cards') is distinct from 'array' or jsonb_typeof(p_batch->'unpublish') is distinct from 'array' then raise exception 'Invalid batch'; end if;
  if jsonb_array_length(p_batch->'cards')+jsonb_array_length(p_batch->'unpublish') not between 1 and 100 then raise exception 'Batch must contain 1-100 operations'; end if;
  perform pg_advisory_xact_lock(hashtextextended('glimpse-content',0));
  for c in select value from jsonb_array_elements(p_batch->'cards') loop
    if jsonb_typeof(c) is distinct from 'object' then raise exception 'Invalid card'; end if;
    select array_agg(key) into keys from jsonb_object_keys(c) key;
    if not keys <@ array['id','version','type','topic','parent','energy','time','art','title','teaser','action','trialTitle','trial','widget','choices','moreTitle','more','source','link','linkLabel'] then raise exception 'Unknown card field'; end if;
    foreach item in array array['id','type','topic','parent','time','art','title','teaser','action','trialTitle','trial','moreTitle','more','source'] loop
      if jsonb_typeof(c->item) is distinct from 'string' or length(btrim(c->>item))=0 or length(c->>item)>12000 then raise exception 'Invalid field %',item; end if;
    end loop;
    target_id:=c->>'id';
    if target_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(target_id)>100 or target_id=any(ids) then raise exception 'Invalid or duplicate id';end if;
    ids:=array_append(ids,target_id);
    if jsonb_typeof(c->'version') is distinct from 'number' or (c->>'version') !~ '^[1-9][0-9]*$' then raise exception 'Invalid version';end if;
    v:=(c->>'version')::integer;
    if coalesce(c->>'energy','') not in ('high','low') or coalesce(c->>'art','') not in ('graph','math','rain','outside','coffee','queue','state') then raise exception 'Invalid card format';end if;
    if c ? 'widget' and (coalesce(c->>'widget','') not in ('reachability','queue') or c ? 'choices') then raise exception 'Invalid widget';end if;
    if c ? 'choices' then
      if jsonb_typeof(c->'choices') is distinct from 'array' then raise exception 'Invalid choices';end if;
      if jsonb_array_length(c->'choices') not between 1 and 8 or exists(select 1 from jsonb_array_elements(c->'choices') x where jsonb_typeof(x->'label') is distinct from 'string' or jsonb_typeof(x->'reply') is distinct from 'string' or length(btrim(x->>'label')) not between 1 and 200 or length(btrim(x->>'reply')) not between 1 and 12000) then raise exception 'Invalid choices';end if;
    end if;
    if c ? 'link' and (coalesce(c->>'link','') !~ '^https://[^/@[:space:]]+([/:?#]|$)' or coalesce(length(btrim(c->>'linkLabel')),0)=0) then raise exception 'Invalid link';end if;
    select * into old from public.cards where id=target_id;
    if found and (v<old.version or (v=old.version and c<>old.payload)) then raise exception 'Increase version when editing %',target_id;end if;
    insert into public.cards(id,version,payload,published) values(target_id,v,c,true)
    on conflict(id) do update set version=excluded.version,payload=excluded.payload,published=true,updated_at=clock_timestamp();
  end loop;
  for target_id in select jsonb_array_elements_text(p_batch->'unpublish') loop
    if target_id=any(ids) then raise exception 'Duplicate id';end if;
    ids:=array_append(ids,target_id);
    update public.cards set published=false,updated_at=clock_timestamp() where id=target_id;
    if not found then raise exception 'Unknown card to unpublish: %',target_id;end if;
  end loop;
  return jsonb_build_object('published',jsonb_array_length(p_batch->'cards'),'unpublished',jsonb_array_length(p_batch->'unpublish'));
end;
$$;
revoke all on function public.publish_card_batch(jsonb) from public,anon,authenticated;
grant execute on function public.publish_card_batch(jsonb) to service_role;

-- Derive identity from the verified session and reject a request sent after an account switch.
create function public.apply_record_ops(p_user_id uuid,p_ops jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); op jsonb; card jsonb; accepted uuid; stamp timestamptz; amount bigint; kind text; opinion text;
begin
  if uid is null or uid is distinct from p_user_id then raise exception 'Wrong account' using errcode='42501';end if;
  if jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops) not between 1 and 100 then raise exception 'Invalid operations';end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  for op in select value from jsonb_array_elements(p_ops) loop
    card:=op->'card';kind:=op->>'kind';opinion:=op->>'reaction';
    if kind is null or kind not in ('open','rate','import') or jsonb_typeof(card) is distinct from 'object' or coalesce(card->>'id','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(card->>'id')>100 then raise exception 'Invalid operation';end if;
    if coalesce(jsonb_typeof(card->'title'),'')<>'string' or length(card->>'title')>12000 or coalesce(jsonb_typeof(card->'topic'),'')<>'string' or coalesce(jsonb_typeof(card->'parent'),'')<>'string' or coalesce(card->>'version','') !~ '^[1-9][0-9]*$' then raise exception 'Invalid metadata';end if;
    if kind in ('rate','import') and (not op ? 'reaction' or (op->'reaction'<>'null'::jsonb and coalesce(opinion,'') not in ('like','dislike'))) then raise exception 'Invalid reaction';end if;
    if kind='import' and (coalesce(op->>'opens','') !~ '^[0-9]+$' or (op->>'opens')::numeric>9007199254740991) then raise exception 'Invalid import count';end if;
    accepted:=null;
    insert into public.record_operations(user_id,op_id) values(uid,(op->>'op_id')::uuid) on conflict do nothing returning op_id into accepted;
    if accepted is null then continue;end if;
    stamp:=clock_timestamp();
    insert into public.personal_records(user_id,card_id,metadata) values(uid,card->>'id',card) on conflict do nothing;
    update public.personal_records set metadata=card,updated_at=stamp where user_id=uid and card_id=card->>'id';
    if kind='open' then
      update public.personal_records set opens=opens+1,last_opened_at=stamp where user_id=uid and card_id=card->>'id';
    elsif kind='rate' then
      update public.personal_records set reaction=opinion,rated_at=stamp where user_id=uid and card_id=card->>'id';
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
