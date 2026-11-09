create table if not exists households (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);
