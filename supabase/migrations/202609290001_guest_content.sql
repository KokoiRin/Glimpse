begin;
drop policy if exists published_cards on public.cards;
create policy guest_cards on public.cards for select to anon
  using (published and payload->>'energy' = 'low');
create policy member_cards on public.cards for select to authenticated
  using (published);
commit;
