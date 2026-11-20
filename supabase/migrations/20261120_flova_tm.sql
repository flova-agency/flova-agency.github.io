-- Mémoire de traduction commune Flova : une phrase traduite une fois sert à tous les sites (aucun nouvel appel à l'IA).
-- Seule la fonction serveur (clé de service) lit et écrit ; aucun accès client.
create table if not exists public.flova_tm (
  lang text not null,
  h text not null,
  src text not null,
  dst text not null,
  hits integer not null default 0,
  at timestamptz not null default now(),
  primary key (lang, h)
);
alter table public.flova_tm enable row level security;
create or replace function public.flova_tm_hit(p_lang text, p_h text[]) returns void
language sql security definer set search_path = public as $$
  update public.flova_tm set hits = hits + 1 where lang = p_lang and h = any(p_h);
$$;
revoke all on function public.flova_tm_hit(text, text[]) from public, anon, authenticated;
grant execute on function public.flova_tm_hit(text, text[]) to service_role;
