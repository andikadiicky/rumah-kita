export type EssentialStatus = "in_stock" | "to_buy" | "out_of_stock";
export type Essential = {
  id: string;
  name: string;
  status: EssentialStatus;
  planned_purchase_date: string | null;
};
export type EssentialFilter = "all" | "to_buy" | "out_of_stock";
export const statusLabels: Record<EssentialStatus, string> = {
  in_stock: "Tersedia", to_buy: "Perlu Dibeli", out_of_stock: "Habis",
};
export function needsBuying(item: Pick<Essential, "status">) {
  return item.status === "to_buy" || item.status === "out_of_stock";
}
export function matchesFilter(item: Essential, filter: EssentialFilter) {
  return filter === "all" || (filter === "to_buy" ? needsBuying(item) : item.status === "out_of_stock");
}
export function isOverdue(item: Essential, today: string) {
  return needsBuying(item) && !!item.planned_purchase_date && item.planned_purchase_date < today;
}
export function purchasedCommand(item: Essential) {
  return {
    entity: "essential", action: "save",
    data: { id: item.id, name: item.name, status: "in_stock", planned_purchase_date: null },
  } as const;
}
export function formatPurchaseDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}
