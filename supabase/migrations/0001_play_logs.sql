-- Play logs (opt-in): one row per room, sent by the game (apps/web/src/account) only while a signed-in
-- player has switched on "Send my play logs" in Settings. The game holds just the project's address and
-- its public key, so these rules are what keep each player's rows their own: a player may add rows
-- only as themselves and read only their own. Nobody can change or delete a row from the game: there
-- is no update or delete policy, and those privileges are taken from the game's roles too. Deleting an
-- account (Authentication → Users) deletes its rows with it.

create table public.play_logs (
  -- Made by the game, the same for every try at sending a room's record, so a repeat is refused.
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  room_id text not null check (char_length(room_id) between 1 and 100),
  -- The room's record: time, whether it was won, hints, mistakes, commands typed, device speed.
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 32768),
  created_at timestamptz not null default now()
);

comment on table public.play_logs is
  'Opt-in play logs from Wirelight: one row per room, sent only while the player has switched them on.';

-- Row Level Security looks rows up by player.
create index play_logs_user_id_idx on public.play_logs (user_id);

alter table public.play_logs enable row level security;

-- Signed-out visitors (anon) get nothing; signed-in players (authenticated) may only add and read.
revoke all on table public.play_logs from anon, authenticated;
grant select, insert on table public.play_logs to authenticated;

create policy "Players add their own play logs"
  on public.play_logs
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Players read their own play logs"
  on public.play_logs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- No update or delete policy, on purpose: with Row Level Security on, no player can change or delete a row.
