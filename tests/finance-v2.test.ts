import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { categorySlices, financeCommandSchema, formatMoneyInput, moneyInputDigits, type FinanceReport } from "../src/lib/finance/model";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

test("comma grouping retains exact integer amounts; pie includes paid spending only", () => {
  assert.equal(formatMoneyInput("1234567"), "1,234,567");
  assert.equal(formatMoneyInput(""), "");
  assert.equal(moneyInputDigits("Rp 1,234,567"), "1234567");
  assert.equal(moneyInputDigits("999,999,999,999"), "999999999999");
  for (const value of ["-1", "1.50", "1000000000000", "1e6"]) assert.equal(moneyInputDigits(value), null);
  const slices = categorySlices([
    { category: "groceries", paid: "100", dika: "100", affi: "0", pending: "10000" },
    { category: "hutang", paid: "300", dika: "0", affi: "300", pending: "0" },
    { category: "wifi", paid: "0", dika: "0", affi: "0", pending: "500" },
  ]);
  assert.deepEqual(slices.map(({ start, end, share }) => ({ start, end, share })), [{ start: 0, end: 25, share: 25 }, { start: 25, end: 100, share: 75 }]);
  assert.deepEqual(categorySlices([]), []);
  assert.equal(financeCommandSchema.safeParse({ entity: "category", action: "save", data: { label: "Hobi" } }).success, true);
  assert.equal(financeCommandSchema.safeParse({ entity: "category", action: "save", data: { label: "Hobi", owner_id: owner } }).success, false);
});

test("004 preserves legacy cash, separates debt records, migrates categories, and enforces owner isolation", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon;
      grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('${owner}'),('${other}');`);
    await db.exec(await readFile(new URL("../supabase/migrations/003_cash_flow.sql", import.meta.url), "utf8"));
    const debtId = (await db.query<{id: string}>(`insert into public.finance_debts(owner_id,title,direction,counterparty,person,principal,start_date)
      values ($1,'Utang lama','payable','Toko','dika',300000,'2026-11-01') returning id`, [owner])).rows[0].id;
    const oldTx = (await db.query<{id: string}>(`insert into public.finance_transactions(owner_id,transaction_date,title,kind,person,category,amount,status,debt_id) values
      ($1,'2026-11-01','Cicilan lama','expense','dika','pinjaman',100000,'paid',$2) returning id`, [owner,debtId])).rows[0].id;
    await db.query(`insert into public.finance_transactions(owner_id,transaction_date,title,kind,person,category,amount,status)
      values ($1,'2026-11-01','Saldo','opening','dika','saldo_awal',1000000,'paid')`,[owner]);
    await db.exec(await readFile(new URL("../supabase/migrations/004_finance_categories_and_tracker.sql", import.meta.url), "utf8"));
    // New admin-created accounts get their own default catalog too.
    await db.exec("insert into auth.users values ('33333333-3333-4333-8333-333333333333')");
    assert.ok((await db.query("select id from public.finance_categories where owner_id='33333333-3333-4333-8333-333333333333'")).rows.length > 10);
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}'`);
    const report = async () => (await db.query<{data: FinanceReport}>("select public.finance_report('2026-11-01') as data")).rows[0].data;
    let r = await report();
    assert.equal(r.balances.find((b) => b.person === "dika")?.closing, "900000");
    assert.equal(r.debts[0].paid, "100000"); assert.equal(r.payments.length, 1);
    assert.equal(r.pivot[0].category, "hutang");
    assert.equal(r.categories.find((c) => c.code === "hutang")?.label, "Hutang");
    assert.equal((await db.query<{category: string}>("select category from public.finance_transactions where id=$1",[oldTx])).rows[0].category,"hutang");
    const cashCount = (await db.query("select id from public.finance_transactions")).rows.length;
    const payId = (await db.query<{id: string}>(`insert into public.finance_debt_payments(owner_id,debt_id,payment_date,amount,status)
      values ($1,$2,'2026-11-05',50000,'paid') returning id`,[owner,debtId])).rows[0].id;
    r = await report(); assert.equal(r.debts[0].remaining,"150000");
    assert.equal(r.balances.find((b) => b.person === "dika")?.closing,"900000");
    assert.equal((await db.query("select id from public.finance_transactions")).rows.length,cashCount);
    await db.query("update public.finance_debt_payments set amount=75000 where id=$1",[payId]);
    assert.equal((await report()).debts[0].remaining,"125000");
    await assert.rejects(db.query("update public.finance_debt_payments set amount=200001 where id=$1",[payId]));
    await assert.rejects(db.query("update public.finance_debts set principal=100000 where id=$1",[debtId]));
    await db.query("delete from public.finance_debt_payments where id=$1",[payId]);
    assert.equal((await report()).debts[0].remaining,"200000");
    assert.equal((await report()).balances.find((b) => b.person === "dika")?.closing,"900000");
    const custom = (await db.query<{id: string;code: string}>("insert into public.finance_categories(owner_id,label) values ($1,'Hobi') returning id,code",[owner])).rows[0];
    await db.query(`insert into public.finance_transactions(owner_id,transaction_date,title,kind,person,category,amount,status)
      values ($1,'2026-11-07','Hobi uji','expense','affi',$2,1000,'pending')`,[owner,custom.code]);
    await db.query("update public.finance_categories set label='Hobi keluarga' where id=$1",[custom.id]);
    r = await report(); assert.equal(r.categories.find((c) => c.code===custom.code)?.label,"Hobi keluarga");
    assert.equal(r.pivot.find((p) => p.category===custom.code)?.pending,"1000");
    await assert.rejects(db.query("insert into public.finance_categories(owner_id,label) values ($1,'HOBI KELUARGA')",[owner]));
    await assert.rejects(db.query("update public.finance_categories set code='changed' where id=$1",[custom.id]));
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal((await db.query("select id from public.finance_debt_payments")).rows.length,0);
    assert.equal((await db.query("update public.finance_categories set label='Curang' where id=$1 returning id",[custom.id])).rows.length,0);
    assert.equal((await db.query("delete from public.finance_debt_payments where id=$1 returning id",[r.payments[0].id])).rows.length,0);
    await assert.rejects(db.query(`insert into public.finance_debt_payments(owner_id,debt_id,payment_date,amount,status) values ($1,$2,'2026-11-05',1,'paid')`,[other,debtId]));
    await assert.rejects(db.query(`insert into public.finance_transactions(owner_id,transaction_date,title,kind,person,category,amount,status)
      values ($1,'2026-11-05','Curang','expense','affi',$2,1,'paid')`,[other,custom.code]));
    assert.equal((await report()).payments.length,0);
    await db.exec(`set request.jwt.claim.sub='${owner}'`);
    const beforeDelete = (await report()).balances;
    await db.query("delete from public.finance_debts where id=$1",[debtId]);
    assert.deepEqual((await report()).balances,beforeDelete);
    assert.equal((await report()).payments.length,0);
    await db.exec("reset role; set role anon");
    for (const table of ["finance_debt_payments","finance_categories"]) await assert.rejects(db.exec(`select * from public.${table}`));
    await assert.rejects(db.exec("select public.finance_report('2026-11-01')"));
  } finally { await db.close(); }
});
