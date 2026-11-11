import { z } from "zod";
import { todayInJakarta } from "../date";

export const people = { dika: "Dika", affi: "Affi" } as const;
export const kinds = { income: "Pemasukan", expense: "Pengeluaran", transfer: "Transfer Dika–Affi", opening: "Saldo awal" } as const;
export const categories = {
  gaji: "Gaji", bonus: "Bonus", usaha: "Usaha", hadiah: "Hadiah", pinjaman: "Pinjaman",
  kewajiban: "Kewajiban", piutang: "Piutang", subscription: "Subscription", rumah: "Rumah",
  wifi: "WiFi", listrik: "Listrik", uang_sangu: "Uang sangu", groceries: "Groceries",
  savings: "Savings", transportasi: "Transportasi", kesehatan: "Kesehatan", pendidikan: "Pendidikan",
  hiburan: "Hiburan", makan_di_luar: "Makan di luar", donasi: "Donasi", lainnya: "Lainnya",
  transfer: "Transfer", saldo_awal: "Saldo awal",
} as const;
export const statuses = { paid: "Sudah dibayar / diterima", pending: "Pending", cancelled: "Dibatalkan" } as const;
export type Person = keyof typeof people;
export type Category = keyof typeof categories;
export type Kind = keyof typeof kinds;
export type Status = keyof typeof statuses;
export type FinanceTransaction = {
  id: string; transaction_date: string; title: string; kind: Kind; person: Person;
  destination: Person | null; category: Category; amount: number; status: Status; debt_id: string | null; notes: string;
};
export type Debt = {
  id: string; title: string; direction: "payable" | "receivable"; counterparty: string; person: Person;
  principal: number; installment_count: number; first_payment_date: string | null; start_date: string; due_date: string | null; notes: string; paid: string; remaining: string;
};
export type FinanceReport = {
  income: string; spending: string; pending: string; balances: { person: Person; opening: string; closing: string; reserved: string }[];
  pivot: { category: Category; dika: string; affi: string; paid: string; pending: string }[];
  history: { month: string; income: string; spending: string; pending: string }[];
  debts: Debt[];
};
const id = z.uuid();
const text = z.string().trim().min(1).max(200);
const date = z.iso.date().refine((v) => v >= "0001-01-01");
const amount = z.number().int().positive().max(999_999_999_999);
const person = z.enum(["dika", "affi"]);
const transaction = z.strictObject({
  id: id.optional(), transaction_date: date, title: text, kind: z.enum(["income", "expense", "transfer", "opening"]),
  person, destination: person.nullable().default(null), category: z.enum(Object.keys(categories) as [Category, ...Category[]]),
  amount, status: z.enum(["paid", "pending", "cancelled"]), debt_id: id.nullable().default(null), notes: z.string().trim().max(2000).default(""),
}).superRefine((v, ctx) => {
  if ((v.kind === "transfer" && (!v.destination || v.destination === v.person || v.category !== "transfer" || v.debt_id)) ||
      (v.kind !== "transfer" && v.destination) ||
      (v.kind === "opening" && (v.category !== "saldo_awal" || v.status !== "paid" || v.debt_id)) ||
      (["income", "expense"].includes(v.kind) && ["transfer", "saldo_awal"].includes(v.category))) {
    ctx.addIssue({ code: "custom", message: "Jenis, sumber, tujuan, dan kategori tidak sesuai" });
  }
});
const debt = z.strictObject({
  id: id.optional(), title: text, direction: z.enum(["payable", "receivable"]), counterparty: text, person,
  principal: amount, installment_count: z.number().int().min(1).max(360).default(1),
  first_payment_date: date.nullable().default(null), start_date: date, due_date: date.nullable().default(null), notes: z.string().trim().max(2000).default(""),
}).refine((v) => v.installment_count <= v.principal && (!v.first_payment_date || v.first_payment_date >= v.start_date) && (!v.due_date || v.due_date >= v.start_date), { message: "Jatuh tempo sebelum tanggal mulai", path: ["due_date"] });
export const financeCommandSchema = z.union([
  z.strictObject({ entity: z.literal("transaction"), action: z.literal("save"), data: transaction }),
  z.strictObject({ entity: z.literal("transaction"), action: z.literal("delete"), data: z.strictObject({ id }) }),
  z.strictObject({ entity: z.literal("debt"), action: z.literal("save"), data: debt }),
  z.strictObject({ entity: z.literal("debt"), action: z.literal("delete"), data: z.strictObject({ id }) }),
]);
export type FinanceCommand = z.infer<typeof financeCommandSchema>;
export function rupiah(value: string | number | bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(BigInt(value));
}
export function monthStart(value: unknown): string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value >= "0001-01" && value <= "9998-12"
    ? value : todayInJakarta().slice(0, 7);
}
export function shiftMonth(month: string, delta: number): string | null {
  const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + delta);
  const value = d.toISOString().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(value) && value >= "0001-01" && value <= "9998-12" ? value : null;
}
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}
export function percent(part: string | bigint, total: string | bigint): number {
  return BigInt(total) > 0n ? Math.min(100, Number(BigInt(part) * 10000n / BigInt(total)) / 100) : 0;
}

/** Equal integer-rupiah installments; earlier rows absorb the rounding remainder. */
export function debtSchedule(debt: Debt): { date: string; amount: bigint; paid: bigint; remaining: bigint }[] {
  const count = debt.installment_count;
  const principal = BigInt(debt.principal);
  const base = principal / BigInt(count);
  const extra = Number(principal % BigInt(count));
  let paid = BigInt(debt.paid);
  const first = debt.first_payment_date ?? debt.start_date;
  const originalDay = Number(first.slice(8));
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${first}T00:00:00Z`);
    date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + index);
    const end = new Date(date); end.setUTCMonth(end.getUTCMonth() + 1, 0);
    date.setUTCDate(Math.min(originalDay, end.getUTCDate()));
    const amount = base + BigInt(index < extra ? 1 : 0);
    const allocated = paid < amount ? paid : amount;
    paid -= allocated;
    return { date: date.toISOString().slice(0, 10), amount, paid: allocated, remaining: amount - allocated };
  });
}

export function debtIsOverdue(debt: Debt, cutoff: string): boolean {
  return BigInt(debt.remaining) > BigInt(0) && (
    (!!debt.due_date && debt.due_date < cutoff) ||
    debtSchedule(debt).some((part) => part.date < cutoff && part.remaining > BigInt(0))
  );
}
