begin;

create table public.essentials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  status text not null check (status in ('in_stock', 'to_buy', 'out_of_stock')),
  planned_purchase_date date,
  created_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  servings integer not null check (servings between 1 and 1000),
  ingredients text[] not null check (cardinality(ingredients) between 1 and 200),
  steps text[] not null check (cardinality(steps) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (owner_id, id)
);

create table public.meal_slots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  meal_date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner')),
  recipe_id uuid,
  -- Snapshot of the recipe name, or the custom meal name. Survives recipe deletion.
  meal_name text not null check (char_length(btrim(meal_name)) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (owner_id, meal_date, meal_type),
  foreign key (owner_id, recipe_id) references public.recipes(owner_id, id)
    on delete set null (recipe_id)
);

create index essentials_owner_idx on public.essentials(owner_id);
-- The recipes unique index and meal_slots unique index already lead with owner_id.
create index meal_slots_recipe_idx on public.meal_slots(owner_id, recipe_id);

-- An invoker trigger snapshots the name and also validates recipe ownership.
-- The composite FK independently prevents cross-owner recipe links.
create function public.snapshot_meal_recipe_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.recipe_id is not null then
    select r.name into new.meal_name
    from public.recipes r
    where r.id = new.recipe_id and r.owner_id = new.owner_id;
    if not found then
      raise exception 'Invalid recipe reference' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

create trigger meal_recipe_name
before insert or update on public.meal_slots
for each row execute function public.snapshot_meal_recipe_name();

alter table public.essentials enable row level security;
alter table public.recipes enable row level security;
alter table public.meal_slots enable row level security;

revoke all on public.essentials, public.recipes, public.meal_slots from public, anon, authenticated;
grant select, insert, update, delete on public.essentials, public.recipes, public.meal_slots to authenticated;
revoke all on function public.snapshot_meal_recipe_name() from public, anon, authenticated;

create policy essentials_owner on public.essentials for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy recipes_owner on public.recipes for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy meal_slots_owner on public.meal_slots for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- The original scaffold table is not used by this backend. Close its access too.
alter table public.households enable row level security;
revoke all on public.households from public, anon, authenticated;

commit;
