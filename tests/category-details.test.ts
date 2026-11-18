import assert from "node:assert/strict";
import test from "node:test";
import { categoryDetailsQuery } from "../src/lib/finance/category-details";

test("category drill-down accepts calendar month and bounded pagination only", () => {
  assert.deepEqual(categoryDetailsQuery.parse({ month: "2026-11", category: "groceries" }), { month: "2026-11", category: "groceries", page: 1 });
  for (const month of ["0000-01", "9999-01", "2026-13", "2026-1", "2026-11-01"]) {
    assert.equal(categoryDetailsQuery.safeParse({ month, category: "groceries" }).success, false);
  }
  for (const page of ["0", "-1", "1.5", "100001", "x"]) {
    assert.equal(categoryDetailsQuery.safeParse({ month: "2026-11", category: "groceries", page }).success, false);
  }
  assert.equal(categoryDetailsQuery.safeParse({ month: "2026-11", category: "groceries", owner_id: "someone-else" }).success, false);
  assert.equal(categoryDetailsQuery.safeParse({ month: "2026-11", category: "groceries),status.eq.cancelled" }).success, false);
});
