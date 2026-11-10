import assert from "node:assert/strict";
import { test } from "node:test";
import { addCalendarDays, displayedMealName, mondayForDate, selectedMonday, weekDates, type MealSlot } from "../src/lib/meal-plan/model";
import { todayInJakarta } from "../src/lib/date";

test("Monday-to-Sunday calendar navigation crosses months, leap days, and years", () => {
  assert.equal(mondayForDate("2026-12-01"), "2026-11-30");
  assert.deepEqual(weekDates("2026-11-30"), ["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
  assert.equal(addCalendarDays("2026-11-30", 7), "2026-12-07");
  assert.equal(addCalendarDays("2026-12-07", -7), "2026-11-30");
  assert.equal(addCalendarDays("2024-02-26", 7), "2024-03-04");
  assert.equal(mondayForDate("2027-01-01"), "2026-12-28");
  assert.equal(addCalendarDays("2026-12-28", 7), "2027-01-04");
});

test("URL weeks normalize to Monday; invalid values use Jakarta's current week", () => {
  const today = todayInJakarta(new Date("2026-11-08T17:00:00Z"));
  assert.equal(today, "2026-11-09");
  assert.equal(selectedMonday("2026-12-02", today), "2026-11-30");
  for (const value of [undefined, ["2026-11-30"], "2026-02-29", "2026-11-30T00:00:00Z", "0000-01-01", "9999-12-31"]) {
    assert.equal(selectedMonday(value, today), "2026-11-09");
  }
});

test("linked slot uses current recipe name; unlinked slot retains stored name", () => {
  const slot: MealSlot = { id: "slot", meal_date: "2026-11-30", meal_type: "lunch", recipe_id: "recipe", meal_name: "Nama awal" };
  assert.equal(displayedMealName(slot, [{ id: "recipe", name: "Nama terbaru" }]), "Nama terbaru");
  assert.equal(displayedMealName({ ...slot, recipe_id: null }, []), "Nama awal");
});
