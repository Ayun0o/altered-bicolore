-- Altered bicolore : tables du compte en ligne (à coller dans Supabase → SQL Editor → Run)

-- Profil public (pseudo), pour le futur classement
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

-- Decks de chaque joueur
create table if not exists public.decks (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Parties terminées (statistiques)
create table if not exists public.games (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Sécurité : chacun ne voit et ne modifie que ses propres lignes
alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.games enable row level security;

drop policy if exists "profil lisible par tous" on public.profiles;
create policy "profil lisible par tous" on public.profiles for select using (true);
drop policy if exists "mon profil" on public.profiles;
create policy "mon profil" on public.profiles for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "mes decks" on public.decks;
create policy "mes decks" on public.decks for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "mes parties (lecture)" on public.games;
create policy "mes parties (lecture)" on public.games for select to authenticated using (auth.uid() = user_id);
drop policy if exists "mes parties (ajout)" on public.games;
create policy "mes parties (ajout)" on public.games for insert to authenticated with check (auth.uid() = user_id);

grant select on public.profiles to anon, authenticated;
grant insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.decks to authenticated;
grant select, insert on public.games to authenticated;
