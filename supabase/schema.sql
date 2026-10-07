-- IRL FPS — Postgres / Supabase schema (v0.1)
-- Design rule: anything mode-specific lives in jsonb `config`, so new modes need no migrations.

create extension if not exists "pgcrypto";

-- ───────── ENUMS ─────────
create type match_status   as enum ('lobby','countdown','live','paused','finished','cancelled');
create type player_state   as enum ('alive','down','eliminated','spectating','disconnected');
create type balloon_state  as enum ('armed','popped','void');
create type hit_result     as enum ('accepted','duplicate','own_team','self','expired','wrong_match','dead_target','invalid');
create type chat_channel   as enum ('global','team','dm','system');
create type zone_kind      as enum ('control_point','safe_zone','spawn','extraction','boundary','no_go','loot');
create type role_kind      as enum ('player','admin','referee','spectator');

-- ───────── IDENTITY ─────────
-- Login = callsign from an allowlist (no passwords at first; optional pin).
create table profiles (
  id           uuid primary key default gen_random_uuid(),
  callsign     text unique not null check (callsign = upper(callsign)),
  display_name text,
  pin_hash     text,                          -- optional, null = name-only login
  role         role_kind not null default 'player',
  avatar_color text default '#30D158',
  is_active    boolean default true,
  created_at   timestamptz default now()
);

create table allowed_names (                  -- the "specific names" whitelist
  callsign text primary key,
  claimed_by uuid references profiles(id),
  note text
);

-- ───────── MODES (flexible) ─────────
create table game_modes (
  id          text primary key,               -- 'battle_royale','sniping','arena_breakout','domination'
  name        text not null,
  description text,
  team_based  boolean default true,
  default_config jsonb not null default '{}', -- see examples below
  created_at  timestamptz default now()
);
-- default_config examples:
-- battle_royale : {"hp":3,"zone_shrink_every_s":300,"zone_stages":4,"friendly_fire":false,"respawn":false}
-- sniping       : {"hp":1,"headshot_balloon":true,"min_range_m":20,"respawn":true,"respawn_delay_s":60}
-- arena_breakout: {"hp":5,"extraction_required":true,"extract_hold_s":30,"loot_enabled":true}
-- domination    : {"hp":3,"capture_hold_s":20,"points_per_tick":1,"tick_s":10,"score_limit":300,"respawn":true}

-- ───────── MATCHES ─────────
create table matches (
  id          uuid primary key default gen_random_uuid(),
  mode_id     text not null references game_modes(id),
  name        text,
  join_code   text unique not null,           -- short lobby code
  status      match_status default 'lobby',
  config      jsonb not null default '{}',    -- overrides mode default_config
  field_center  geography(point),             -- needs postgis; else use lat/lng columns
  field_radius_m int,
  max_players int default 20,
  host_id     uuid references profiles(id),
  scheduled_at timestamptz,
  started_at  timestamptz,
  ended_at    timestamptz,
  winner_team_id uuid,
  created_at  timestamptz default now()
);

create table teams (
  id        uuid primary key default gen_random_uuid(),
  match_id  uuid not null references matches(id) on delete cascade,
  name      text not null,
  color     text not null,                    -- hex, e.g. #0A84FF
  color_name text,                            -- 'BLUE'
  score     int default 0,
  is_solo   boolean default false,            -- battle royale: 1-player "teams"
  unique (match_id, name),
  unique (match_id, color)
);
alter table matches add constraint fk_winner foreign key (winner_team_id) references teams(id);

-- A player's presence inside one match. HP state lives here.
create table match_players (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references matches(id) on delete cascade,
  profile_id  uuid not null references profiles(id),
  team_id     uuid references teams(id),
  state       player_state default 'alive',
  max_hp      int not null default 3,
  hp          int not null default 3,
  kills       int default 0,
  deaths      int default 0,
  assists     int default 0,
  points      int default 0,
  loadout     jsonb default '{}',             -- {"weapon":"M4 AEG","fps":330}
  joined_at   timestamptz default now(),
  eliminated_at timestamptz,
  unique (match_id, profile_id),
  check (hp between 0 and max_hp)
);
create index on match_players (match_id, team_id);

-- ───────── BALLOONS & CODES ─────────
-- Each balloon has a unique secret code printed/written inside it.
create table balloons (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references matches(id) on delete cascade,
  match_player_id uuid not null references match_players(id) on delete cascade,
  code            text not null,              -- e.g. 'K7-4Q9' (unique per match)
  slot            int,                        -- 1..N on the player's vest
  color           text,                       -- physical balloon color
  hp_value        int not null default 1,     -- damage when popped (headshot balloon could be 2)
  state           balloon_state default 'armed',
  popped_at       timestamptz,
  unique (match_id, code)
);
create index on balloons (match_player_id);

-- ───────── HITS (append-only log; the source of truth) ─────────
create table hits (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references matches(id) on delete cascade,
  shooter_id    uuid not null references match_players(id),
  target_id     uuid references match_players(id),
  balloon_id    uuid references balloons(id),
  code_entered  text not null,
  result        hit_result not null,
  damage        int default 0,
  shooter_pos   jsonb,                        -- {"lat":..,"lng":..}
  created_at    timestamptz default now()
);
create index on hits (match_id, created_at desc);
-- Apply damage in an RPC `submit_hit(match_id, shooter, code)` that, in one transaction:
-- locks balloon -> validates (armed, other team, target alive, match live) -> pops it ->
-- hp -= hp_value -> state='eliminated' at 0 -> kills/deaths++ -> inserts hits + events.

-- ───────── MAP ─────────
create table zones (
  id        uuid primary key default gen_random_uuid(),
  match_id  uuid not null references matches(id) on delete cascade,
  kind      zone_kind not null,
  name      text,                             -- 'ALPHA','EXTRACT 1'
  shape     jsonb not null,                   -- {"type":"circle","lat":..,"lng":..,"r":30} or polygon
  owner_team_id uuid references teams(id),    -- domination control
  progress  numeric default 0,                -- capture 0..1
  active_from timestamptz,
  active_to   timestamptz,
  config    jsonb default '{}'
);

create table positions (                      -- latest only (upsert); history optional
  match_player_id uuid primary key references match_players(id) on delete cascade,
  lat double precision, lng double precision, accuracy_m real, heading real,
  updated_at timestamptz default now()
);

-- ───────── CHAT & COMMS ─────────
create table chat_rooms (
  id        uuid primary key default gen_random_uuid(),
  match_id  uuid references matches(id) on delete cascade,
  kind      chat_channel not null,
  team_id   uuid references teams(id),        -- for team channels
  voice_room text                              -- id of WebRTC/LiveKit room for "team call"
);

create table messages (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid not null references chat_rooms(id) on delete cascade,
  sender_id uuid references match_players(id),
  body      text not null,
  kind      text default 'text',              -- 'text','ping','quick_call','system'
  meta      jsonb default '{}',               -- ping coords, quick-call type
  created_at timestamptz default now()
);
create index on messages (room_id, created_at desc);

-- ───────── EVENTS / KILLFEED / REPLAY ─────────
create table events (
  id        bigint generated always as identity primary key,
  match_id  uuid not null references matches(id) on delete cascade,
  type      text not null,                    -- 'hit','elimination','capture','zone_shrink','match_start'
  actor_id  uuid references match_players(id),
  target_id uuid references match_players(id),
  payload   jsonb default '{}',
  created_at timestamptz default now()
);
create index on events (match_id, id);

-- ───────── REALTIME ─────────
-- Supabase: enable realtime on match_players, hits, events, messages, zones, positions.
-- RLS: players read rows of their match; only RPC `submit_hit` mutates hp/balloons.
