import assert from "node:assert/strict";
import { test } from "node:test";
import { isOverdue, matchesFilter, purchasedCommand, type Essential } from "../src/lib/essentials/model";
import { todayInJakarta } from "../src/lib/date";
import { householdCommandSchema } from "../src/lib/household/commands";

const item: Essential = { id: "11111111-1111-4111-8111-111111111111", name: "Beras", status: "to_buy", planned_purchase_date: "2026-11-09" };

test("Perlu Dibeli includes Habis; Semua and Habis remain distinct", () => {
  for (const status of ["in_stock", "to_buy", "out_of_stock"] as const) {
    const row = { ...item, status };
    assert.equal(matchesFilter(row, "all"), true);
    assert.equal(matchesFilter(row, "to_buy"), status !== "in_stock");
    assert.equal(matchesFilter(row, "out_of_stock"), status === "out_of_stock");
  }
});

test("overdue changes at Jakarta midnight, excludes today and stocked items", () => {
  const before = todayInJakarta(new Date("2026-11-09T16:59:59Z"));
  const after = todayInJakarta(new Date("2026-11-09T17:00:00Z"));
  assert.equal(isOverdue(item, before), false);
  assert.equal(isOverdue(item, after), true);
  assert.equal(isOverdue({ ...item, status: "out_of_stock" }, after), true);
  assert.equal(isOverdue({ ...item, status: "in_stock" }, after), false);
  assert.equal(isOverdue({ ...item, planned_purchase_date: null }, after), false);
  assert.equal(isOverdue({ ...item, planned_purchase_date: "2026-11-11" }, after), false);
});

test("Sudah Dibeli uses a single valid save clearing the planned date", () => {
  const command = purchasedCommand(item);
  assert.equal(householdCommandSchema.safeParse(command).success, true);
  assert.deepEqual(command.data, { id: item.id, name: "Beras", status: "in_stock", planned_purchase_date: null });
});
