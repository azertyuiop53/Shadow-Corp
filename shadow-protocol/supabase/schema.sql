-- SHADOW PROTOCOL — schéma des salons. À coller dans Supabase > SQL Editor > Run.
create table if not exists public.lobbies (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  host_id uuid not null references auth.users(id) on delete cascade,
  host_name text not null,
  mode text not null check (mode in ('pvp','pve','pvb')),
  map text not null,
  max_players int not null check (max_players in (4,8,12,24,32)),
  is_public boolean not null default true,
  locked boolean not null default false,
  status text not null default 'waiting' check (status in ('waiting','playing')),
  allow_bots boolean not null default true,
  rules text not null default 'Standard',
  region text not null default 'EU',
  created_at timestamptz not null default now()
);
create table if not exists public.lobby_players (
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  class text not null default 'assault',
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (lobby_id, user_id)
);
create table if not exists public.lobby_bans (
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (lobby_id, user_id)
);
alter table public.lobbies enable row level security;
alter table public.lobby_players enable row level security;
alter table public.lobby_bans enable row level security;

create or replace function public.is_member(l uuid) returns boolean
language sql security definer stable set search_path = public as
$$ select exists(select 1 from public.lobby_players where lobby_id = l and user_id = auth.uid()) $$;

drop policy if exists lobbies_select on public.lobbies;
create policy lobbies_select on public.lobbies for select to authenticated
  using (is_public or host_id = auth.uid() or public.is_member(id));
drop policy if exists lobbies_update on public.lobbies;
create policy lobbies_update on public.lobbies for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());
drop policy if exists lobbies_delete on public.lobbies;
create policy lobbies_delete on public.lobbies for delete to authenticated using (host_id = auth.uid());

drop policy if exists players_select on public.lobby_players;
create policy players_select on public.lobby_players for select to authenticated
  using (user_id = auth.uid() or public.is_member(lobby_id)
         or exists(select 1 from public.lobbies l where l.id = lobby_id and l.is_public));
drop policy if exists players_update_self on public.lobby_players;
create policy players_update_self on public.lobby_players for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Aucune policy d'insertion/suppression directe : tout passe par les fonctions ci-dessous.

create or replace function public.create_lobby(p_name text, p_mode text, p_map text, p_max int, p_public boolean, p_bots boolean, p_rules text, p_host_name text)
returns public.lobbies language plpgsql security definer set search_path = public as $$
declare v_code text; v_row public.lobbies;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists(select 1 from public.lobbies where code = v_code);
  end loop;
  insert into public.lobbies(code, name, host_id, host_name, mode, map, max_players, is_public, allow_bots, rules)
  values (v_code, left(p_name, 40), auth.uid(), left(p_host_name, 24), p_mode, p_map, p_max, p_public, p_bots, left(p_rules, 40))
  returning * into v_row;
  insert into public.lobby_players(lobby_id, user_id, name) values (v_row.id, auth.uid(), left(p_host_name, 24));
  return v_row;
end $$;

create or replace function public.join_lobby(p_code text, p_name text)
returns public.lobbies language plpgsql security definer set search_path = public as $$
declare v_l public.lobbies;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into v_l from public.lobbies where code = upper(trim(p_code));
  if not found then raise exception 'Salon introuvable'; end if;
  if exists(select 1 from public.lobby_bans where lobby_id = v_l.id and user_id = auth.uid()) then raise exception 'Accès refusé'; end if;
  if exists(select 1 from public.lobby_players where lobby_id = v_l.id and user_id = auth.uid()) then return v_l; end if;
  if v_l.locked then raise exception 'Salon verrouillé'; end if;
  if v_l.status <> 'waiting' then raise exception 'Partie déjà en cours'; end if;
  if (select count(*) from public.lobby_players where lobby_id = v_l.id) >= v_l.max_players then raise exception 'Salon complet'; end if;
  insert into public.lobby_players(lobby_id, user_id, name) values (v_l.id, auth.uid(), left(p_name, 24));
  return v_l;
end $$;

create or replace function public.leave_lobby(p_lobby uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_host boolean;
begin
  select host_id = auth.uid() into v_host from public.lobbies where id = p_lobby;
  delete from public.lobby_players where lobby_id = p_lobby and user_id = auth.uid();
  if not exists(select 1 from public.lobby_players where lobby_id = p_lobby) then
    delete from public.lobbies where id = p_lobby;
  elsif v_host then  -- changement d'hôte automatique
    update public.lobbies set
      host_id = (select user_id from public.lobby_players where lobby_id = p_lobby order by joined_at limit 1),
      host_name = (select name from public.lobby_players where lobby_id = p_lobby order by joined_at limit 1)
    where id = p_lobby;
  end if;
end $$;

create or replace function public.kick_player(p_lobby uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.lobbies where id = p_lobby and host_id = auth.uid()) then raise exception 'Réservé à l''hôte'; end if;
  if p_user = auth.uid() then return; end if;
  delete from public.lobby_players where lobby_id = p_lobby and user_id = p_user;
  insert into public.lobby_bans(lobby_id, user_id) values (p_lobby, p_user) on conflict do nothing;
end $$;

revoke all on function public.create_lobby, public.join_lobby, public.leave_lobby, public.kick_player from public, anon;
grant execute on function public.create_lobby, public.join_lobby, public.leave_lobby, public.kick_player to authenticated;

alter publication supabase_realtime add table public.lobbies, public.lobby_players;
