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

-- ============================================================
-- Administration (à coller une fois dans Supabase → SQL Editor → Run)
-- Seuls les comptes listés dans « admins » voient les stats de tout le monde.
-- ============================================================
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "je vois si je suis admin" on public.admins;
create policy "je vois si je suis admin" on public.admins for select to authenticated using (auth.uid() = user_id);
grant select on public.admins to authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

-- L'admin lit toutes les parties
drop policy if exists "admin lit toutes les parties" on public.games;
create policy "admin lit toutes les parties" on public.games for select to authenticated using (public.is_admin());

-- Les pseudos ne sont plus publics : chacun voit le sien, l'admin voit tout le monde
drop policy if exists "profil lisible par tous" on public.profiles;
drop policy if exists "admin lit les profils" on public.profiles;
create policy "admin lit les profils" on public.profiles for select to authenticated using (public.is_admin());

-- Enfin, se déclarer admin (remplace par l'adresse e-mail de TON compte sur le site) :
-- insert into public.admins (user_id) select id from auth.users where email = 'ton.adresse@exemple.fr';
