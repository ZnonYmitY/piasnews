create extension if not exists pgcrypto;

create table if not exists public.social_import_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null default 'supabase-edge/x-api',
  window_days integer not null default 3,
  total_items integer not null default 0,
  payload jsonb not null,
  source_status jsonb not null default '[]'::jsonb
);

create index if not exists social_import_snapshots_created_at_idx
  on public.social_import_snapshots (created_at desc);

alter table public.social_import_snapshots enable row level security;

comment on table public.social_import_snapshots is
  'Latest compact X/Instagram import snapshots for Piasnews social feed publishing.';
