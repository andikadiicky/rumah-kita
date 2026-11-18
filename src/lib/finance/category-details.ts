import { z } from "zod";
import type { FinanceTransaction } from "./model";

export const categoryDetailsQuery = z.strictObject({
  month: z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/).refine((value) => value <= "9998-12"),
  category: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export type CategoryTransaction = Pick<FinanceTransaction, "id" | "transaction_date" | "title" | "person" | "amount" | "status" | "notes">;
export type CategoryDetails = { transactions: CategoryTransaction[]; total: number };
