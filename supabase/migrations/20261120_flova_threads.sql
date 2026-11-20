-- Discussions du studio : chaque demande du client devient une discussion façon WhatsApp,
-- gardée pour lui (reprendre, relire) et pour nous (repérer les besoins communs à tous les clients).
create table if not exists public.flova_threads (
  id bigserial primary key,
  at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  by text default (auth.jwt() ->> 'email'),
  titre text not null,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'question', 'fait', 'annule', 'uxlab')),
  n integer not null default 0
);
create table if not exists public.flova_thread_msgs (
  id bigserial primary key,
  thread_id bigint not null references public.flova_threads(id) on delete cascade,
  at timestamptz not null default now(),
  side text not null check (side in ('in', 'out')),
  texte text not null check (length(texte) <= 4000)
);
create index if not exists flova_thread_msgs_t on public.flova_thread_msgs (thread_id, id);
create index if not exists flova_threads_last on public.flova_threads (last_at desc);

alter table public.flova_threads enable row level security;
alter table public.flova_thread_msgs enable row level security;
drop policy if exists fthr_sel on public.flova_threads;
drop policy if exists fthr_ins on public.flova_threads;
drop policy if exists fthr_upd on public.flova_threads;
drop policy if exists fthm_sel on public.flova_thread_msgs;
drop policy if exists fthm_ins on public.flova_thread_msgs;
create policy fthr_sel on public.flova_threads for select to authenticated using (public.flova_is_editor());
create policy fthr_ins on public.flova_threads for insert to authenticated with check (public.flova_is_editor());
create policy fthr_upd on public.flova_threads for update to authenticated using (public.flova_is_editor()) with check (public.flova_is_editor());
create policy fthm_sel on public.flova_thread_msgs for select to authenticated using (public.flova_is_editor());
create policy fthm_ins on public.flova_thread_msgs for insert to authenticated with check (public.flova_is_editor());

-- chaque message ajouté met à jour l'heure et le compteur de sa discussion (liste triée comme WhatsApp)
create or replace function public.flova_thread_touch() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.flova_threads set last_at = new.at, n = n + 1 where id = new.thread_id;
  return new;
end $$;
drop trigger if exists flova_thread_touch on public.flova_thread_msgs;
create trigger flova_thread_touch after insert on public.flova_thread_msgs for each row execute function public.flova_thread_touch();
grant select, insert, update on public.flova_threads to authenticated;
grant select, insert on public.flova_thread_msgs to authenticated;
grant usage, select on sequence public.flova_threads_id_seq, public.flova_thread_msgs_id_seq to authenticated;
