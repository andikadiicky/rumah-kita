import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const recipeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const recipeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("PostgreSQL migration: RLS, ownership, unique slots, upsert, and deletion fallback", async () => {
  const db = new PGlite();
  try {
    // Minimal Supabase role/auth fixture; production uses Supabase's real Auth.
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('${ownerA}'), ('${ownerB}');
    `);
    for (const file of ["001_initial.sql", "002_household_backend.sql"]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    }
    await db.exec(`
      insert into public.recipes(id, owner_id, name, servings, ingredients, steps) values
      ('${recipeA}', '${ownerA}', 'Nasi goreng', 2, array['Nasi'], array['Goreng']),
      ('${recipeB}', '${ownerB}', 'Soto', 4, array['Ayam'], array['Rebus']);
      insert into public.essentials(owner_id, name, status) values
      ('${ownerA}', 'Beras', 'to_buy'), ('${ownerB}', 'Gula', 'in_stock');
      set role authenticated;
      set request.jwt.claim.sub = '${ownerA}';
    `);
    const rows = await db.query<{name: string}>("select name from public.recipes");
    assert.deepEqual(rows.rows.map((r) => r.name), ["Nasi goreng"]);
    assert.equal((await db.query("select * from public.essentials")).rows.length, 1);
    await assert.rejects(db.exec(`insert into public.essentials(owner_id,name,status) values ('${ownerB}', 'Curang', 'to_buy')`));
    await assert.rejects(db.exec(`update public.recipes set owner_id='${ownerB}' where id='${recipeA}'`));
    assert.equal((await db.query(`delete from public.recipes where id='${recipeB}' returning id`)).rows.length, 0);
    assert.equal((await db.query(`update public.recipes set name='Curang' where id='${recipeB}' returning id`)).rows.length, 0);
    await assert.rejects(db.exec(`insert into public.meal_slots(owner_id,meal_date,meal_type,recipe_id,meal_name)
      values ('${ownerA}', '2026-11-09','lunch','${recipeB}','Soto')`));
    await db.exec(`insert into public.meal_slots(owner_id,meal_date,meal_type,recipe_id,meal_name)
      values ('${ownerA}', '2026-11-09','lunch','${recipeA}','')`);
    await assert.rejects(db.exec(`insert into public.meal_slots(owner_id,meal_date,meal_type,meal_name)
      values ('${ownerA}', '2026-11-09','lunch','Duplikat')`));
    await db.exec(`insert into public.meal_slots(owner_id,meal_date,meal_type,meal_name)
      values ('${ownerA}', '2026-11-09','dinner','Menu awal')
      on conflict(owner_id,meal_date,meal_type) do update set meal_name=excluded.meal_name;
      insert into public.meal_slots(owner_id,meal_date,meal_type,meal_name)
      values ('${ownerA}', '2026-11-09','dinner','Menu baru')
      on conflict(owner_id,meal_date,meal_type) do update set meal_name=excluded.meal_name;`);
    assert.equal((await db.query<{meal_name: string}>("select meal_name from public.meal_slots where meal_type='dinner'")).rows[0].meal_name, "Menu baru");
    await db.exec(`delete from public.recipes where id='${recipeA}'`);
    const fallback = await db.query<{recipe_id: string | null; meal_name: string}>("select recipe_id,meal_name from public.meal_slots where meal_type='lunch'");
    assert.deepEqual(fallback.rows, [{ recipe_id: null, meal_name: "Nasi goreng" }]);
    await db.exec(`set request.jwt.claim.sub = '${ownerB}'`);
    assert.equal((await db.query("select * from public.meal_slots")).rows.length, 0);
    await assert.rejects(db.exec(`insert into public.meal_slots(owner_id,meal_date,meal_type,meal_name) values ('${ownerA}','2026-11-10','breakfast','Curang')`));
    await db.exec("reset role; set role anon");
    for (const table of ["essentials", "recipes", "meal_slots", "households"]) {
      await assert.rejects(db.exec(`select * from public.${table}`));
      await assert.rejects(db.exec(`delete from public.${table}`));
    }
    // Even a privileged SQL writer cannot bypass the cross-owner FK.
    await db.exec("reset role; alter table public.meal_slots disable trigger meal_recipe_name");
    await assert.rejects(db.exec(`insert into public.meal_slots(owner_id,meal_date,meal_type,recipe_id,meal_name)
      values ('${ownerA}', '2026-11-10','lunch','${recipeB}','Soto')`));
  } finally {
    await db.close();
  }
});
