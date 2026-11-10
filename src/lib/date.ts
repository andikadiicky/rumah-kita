/** Calendar dates use Jakarta time; date-only strings use YYYY-MM-DD. */
export const HOUSEHOLD_TIME_ZONE = "Asia/Jakarta";
export const WEEK_STARTS_ON = 1; // Monday

export function todayInJakarta(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HOUSEHOLD_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function startOfWeekInJakarta(now: Date = new Date()): string {
  const date = new Date(`${todayInJakarta(now)}T00:00:00Z`);
  const offset = (date.getUTCDay() - WEEK_STARTS_ON + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}
