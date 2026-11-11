import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { debtIsOverdue, debtSchedule, financeCommandSchema, monthStart, percent, rupiah, shiftMonth, type FinanceReport } from "../src/lib/finance/model";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";

test("finance validates integer rupiah, transfer direction, opening state, dates, and ownership fields", () => {
  const base = { transaction_date: "2026-11-01", title: "Beras", kind: "expense", person: "dika", category: "groceries", amount: 100000, status: "paid" };
  const save = (data: unknown) => financeCommandSchema.safeParse({ entity: "transaction", action: "save", data });
  assert.equal(save(base).success, true);
  for (const patch of [{ amount: 0 }, { amount: 1.5 }, { amount: 1e12 }, { owner_id: first }, { person: "attacker" }, { transaction_date: "2026-02-29" }, { kind: "transfer", category: "transfer", destination: "dika" }, { kind: "opening", category: "saldo_awal", status: "pending" }]) {
    assert.equal(save({ ...base, ...patch }).success, false);
  }
  assert.equal(save({ ...base, kind: "transfer", category: "transfer", destination: "affi" }).success, true);
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(monthStart("2026-13").length, 7);
  assert.ok(rupiah("9007199254740993000").includes("9.007.199.254.740.993.000"));
  assert.equal(percent("1", "3"), 33.33);
});

test("finance migration: exact reports, carryover, paid/pending, transfers, debt guards, and RLS", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon;
      grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('${first}'),('${second}');`);
    await db.exec(await readFile(new URL("../supabase/migrations/003_cash_flow.sql", import.meta.url), "utf8"));
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${first}';`);
    const insert = async (date: string, kind: string, person: string, amount: number, status: string, category: string, destination: string | null = null, debt: string | null = null) => db.query<{id: string}>(
      `insert into public.finance_transactions(owner_id,transaction_date,title,kind,person,amount,status,category,destination,debt_id)
       values ($1,$2,'Uji',$3,$4,$5,$6,$7,$8,$9) returning id`, [first, date, kind, person, amount, status, category, destination, debt]);
    await insert("2026-10-01", "opening", "dika", 200000, "paid", "saldo_awal");
    const firstIncome = await insert("2026-11-01", "income", "dika", 1000000, "paid", "gaji");
    await insert("2026-11-01", "income", "affi", 500000, "paid", "gaji");
    await insert("2026-11-02", "expense", "dika", 100000, "paid", "groceries");
    await insert("2026-11-02", "expense", "affi", 200000, "pending", "groceries");
    await insert("2026-11-03", "expense", "dika", 500000, "cancelled", "lainnya");
    await insert("2026-11-03", "transfer", "dika", 50000, "paid", "transfer", "affi");
    const report = async (month = "2026-11-01") => (await db.query<{report: FinanceReport}>("select public.finance_report($1) as report", [month])).rows[0].report;
    let r = await report();
    assert.equal(r.income, "1500000"); assert.equal(r.spending, "100000"); assert.equal(r.pending, "200000");
    assert.equal(r.balances.find((b) => b.person === "dika")?.closing, "1050000");
    assert.equal(r.balances.find((b) => b.person === "affi")?.closing, "550000");
    assert.equal(r.pivot[0].dika, "100000"); assert.equal(r.pivot[0].pending, "200000");
    assert.equal((await report("2026-12-01")).balances.find((b) => b.person === "dika")?.opening, "1050000");
    await insert("2026-11-04", "transfer", "dika", 10000, "pending", "transfer", "affi");
    r = await report();
    assert.equal(r.balances.reduce((sum,b)=>sum+BigInt(b.reserved),BigInt(0)),BigInt(r.pending),"pending internal transfers must net to zero for household plans");
    const debt = (await db.query<{id: string}>(`insert into public.finance_debts(owner_id,title,direction,counterparty,person,principal,start_date,due_date)
      values ($1,'Utang uji','payable','Bank','affi',300000,'2026-11-01','2026-12-01') returning id`, [first])).rows[0].id;
    await insert("2026-11-05", "expense", "affi", 100000, "paid", "kewajiban", null, debt);
    r = await report(); assert.equal(r.spending, "200000"); assert.equal(r.debts[0].remaining, "200000");
    await assert.rejects(insert("2026-11-06", "expense", "affi", 200001, "paid", "kewajiban", null, debt));
    await assert.rejects(insert("2026-10-31", "expense", "affi", 1, "paid", "kewajiban", null, debt));
    await assert.rejects(insert("2026-11-06", "expense", "dika", 1, "paid", "kewajiban", null, debt));
    await assert.rejects(insert("2026-11-06", "income", "affi", 1, "paid", "kewajiban", null, debt));
    await assert.rejects(db.query("update public.finance_debts set principal=99999 where id=$1", [debt]));
    const pendingPayment = await insert("2026-12-02", "expense", "affi", 200000, "pending", "kewajiban", null, debt);
    assert.equal((await report("2026-12-01")).debts[0].remaining, "200000");
    await db.query("update public.finance_transactions set status='paid' where id=$1", [pendingPayment.rows[0].id]);
    assert.equal((await report("2026-12-01")).debts[0].remaining, "0");
    assert.equal((await report()).debts[0].remaining, "200000", "later repayment must not change older month's report");
    const received = (await db.query<{id: string}>(`insert into public.finance_debts(owner_id,title,direction,counterparty,person,principal,start_date)
      values ($1,'Piutang','receivable','Teman','dika',100000,'2026-11-01') returning id`, [first])).rows[0].id;
    await insert("2026-11-05", "income", "dika", 50000, "paid", "piutang", null, received);
    assert.equal((await report()).debts.find((d) => d.id === received)?.remaining, "50000");
    // More than PostgREST's default page size must still be included in totals.
    await db.query(`insert into public.finance_transactions(owner_id,transaction_date,title,kind,person,amount,status,category)
      select $1,'2026-11-10','Massal','expense','dika',1,'paid','lainnya' from generate_series(1,1005)`, [first]);
    assert.equal((await report()).spending, "201005");
    await db.exec(`set request.jwt.claim.sub='${second}'`);
    assert.equal((await report()).income, "0"); assert.equal((await report()).debts.length, 0);
    assert.equal((await db.query("select id from public.finance_transactions")).rows.length, 0);
    assert.equal((await db.query("update public.finance_transactions set amount=1 where id=$1 returning id", [firstIncome.rows[0].id])).rows.length,0);
    assert.equal((await db.query("delete from public.finance_transactions where id=$1 returning id", [firstIncome.rows[0].id])).rows.length,0);
    assert.ok((await report()).balances.every((b)=>b.closing==="0"));
    assert.equal((await db.query("delete from public.finance_debts where id=$1 returning id", [debt])).rows.length, 0);
    assert.equal((await db.query("update public.finance_debts set principal=1 where id=$1 returning id", [debt])).rows.length, 0);
    await assert.rejects(db.query(`insert into public.finance_transactions(owner_id,transaction_date,title,kind,person,amount,status,category)
      values ($1,'2026-11-01','Curang','expense','dika',1,'paid','lainnya')`, [first]));
    await assert.rejects(db.query(`insert into public.finance_transactions(owner_id,transaction_date,title,kind,person,amount,status,category,debt_id)
      values ($1,'2026-11-01','Curang','expense','affi',1,'paid','lainnya',$2)`, [second, debt]));
    await db.exec(`set request.jwt.claim.sub='${first}'`);
    const before = (await report()).spending;
    await db.query("delete from public.finance_debts where id=$1", [debt]);
    assert.equal((await report()).spending, before, "deleting debt retains repayments and balances");
    await db.exec("reset role; set role anon");
    for (const table of ["finance_transactions", "finance_debts"]) await assert.rejects(db.exec(`select * from public.${table}`));
    await assert.rejects(db.exec("select public.finance_report('2026-11-01')"));
  } finally { await db.close(); }
});

test("installment schedule preserves integer totals, partial FIFO payments, and month-end dates", () => {
  const rows = debtSchedule({ id: "debt", title: "Barang uji", direction: "payable", counterparty: "Toko", person: "dika", principal: 1001, installment_count: 6, first_payment_date: "2026-01-31", start_date: "2026-01-01", due_date: null, notes: "", paid: "200", remaining: "801" });
  assert.equal(rows[0].amount, BigInt(167));
  assert.equal(rows[5].amount, BigInt(166));
  assert.equal(rows.reduce((s,r)=>s+r.amount,BigInt(0)),BigInt(1001));
  assert.equal(rows[0].remaining,BigInt(0));
  assert.equal(rows[1].paid,BigInt(33));
  assert.equal(rows[1].date,"2026-02-28");
  assert.equal(rows[2].date,"2026-03-31");
});

test("unpaid installments can be overdue even without an overall due date", () => {
  const debt = { id: "debt", title: "Cicilan", direction: "payable" as const, counterparty: "Toko", person: "dika" as const, principal: 300000, installment_count: 3, first_payment_date: "2026-11-01", start_date: "2026-11-01", due_date: null, notes: "", paid: "100000", remaining: "200000" };
  assert.equal(debtIsOverdue(debt,"2026-11-11"),false);
  assert.equal(debtIsOverdue(debt,"2026-12-02"),true);
  assert.equal(debtIsOverdue({...debt,paid:"300000",remaining:"0"},"2027-02-01"),false);
});
