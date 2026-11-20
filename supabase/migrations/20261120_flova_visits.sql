-- Statistiques de visites sans cookie ni donnée identifiante : compteurs par jour et par clé.
create table if not exists public.flova_visits (day date not null, k text not null, n integer not null default 0, primary key (day, k));
alter table public.flova_visits enable row level security;
create policy "lecture editeurs" on public.flova_visits for select to authenticated using (public.flova_is_editor());
create or replace function public.flova_hit(p_keys text[]) returns void
language plpgsql security definer set search_path = public as $f$
declare v_key text;
begin
  if p_keys is null or array_length(p_keys,1) is null or array_length(p_keys,1) > 8 then return; end if;
  foreach v_key in array p_keys loop
    if v_key ~ '^[a-z0-9_:-]{1,40}$' then
      insert into flova_visits as fv (day,k,n) values (current_date,v_key,1)
      on conflict (day,k) do update set n = fv.n + 1;
    end if;
  end loop;
end $f$;
revoke all on function public.flova_hit(text[]) from public;
grant execute on function public.flova_hit(text[]) to anon, authenticated;
