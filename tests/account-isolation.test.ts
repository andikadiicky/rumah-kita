import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const firstRow = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secondRow = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("two disposable PostgreSQL accounts cannot read, update, delete, or claim each other's rows", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated;
      grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('${first}'),('${second}');`);
    for (const file of ["001_initial.sql", "002_household_backend.sql"]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    }
    for (const [owner, id, label] of [[first, firstRow, "Pertama"], [second, secondRow, "Kedua"]]) {
      await db.query("insert into public.essentials(id,owner_id,name,status) values ($1,$2,$3,'to_buy')", [id, owner, label]);
      await db.query("insert into public.recipes(id,owner_id,name,servings,ingredients,steps) values ($1,$2,$3,2,array['Bahan'],array['Masak'])", [id, owner, label]);
      await db.query("insert into public.meal_slots(id,owner_id,meal_date,meal_type,recipe_id,meal_name) values ($1,$2,'2026-11-10','lunch',$1,'')", [id, owner]);
    }
    await db.exec("set role authenticated");
    for (const [owner, ownRow, foreignRow, foreignOwner] of [[first, firstRow, secondRow, second], [second, secondRow, firstRow, first]]) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
      for (const table of ["essentials", "recipes", "meal_slots"]) {
        const visible = await db.query<{id: string}>(`select id from public.${table}`);
        assert.deepEqual(visible.rows, [{ id: ownRow }]);
        assert.deepEqual((await db.query(`select id from public.${table} where id=$1`, [foreignRow])).rows, []);
        assert.deepEqual((await db.query(`update public.${table} set owner_id=$1 where id=$2 returning id`, [owner, foreignRow])).rows, []);
        assert.deepEqual((await db.query(`delete from public.${table} where id=$1 returning id`, [foreignRow])).rows, []);
        await assert.rejects(db.query(`update public.${table} set owner_id=$1 where id=$2`, [foreignOwner, ownRow]));
      }
      await assert.rejects(db.query("insert into public.essentials(owner_id,name,status) values ($1,'Curang','to_buy')", [foreignOwner]));
      await assert.rejects(db.query("insert into public.recipes(owner_id,name,servings,ingredients,steps) values ($1,'Curang',2,array['Bahan'],array['Masak'])", [foreignOwner]));
      await assert.rejects(db.query("insert into public.meal_slots(owner_id,meal_date,meal_type,recipe_id,meal_name) values ($1,'2026-11-10','dinner',$2,'Curang')", [owner, foreignRow]));
    }
  } finally {
    await db.close();
  }
});
