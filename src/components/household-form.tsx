"use client";

import Link from "next/link";
import type { HouseholdCommand } from "@/lib/household/commands";

export const buttonClass = "min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 disabled:cursor-wait disabled:opacity-50";
export const inputClass = "min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base";
export type WriteResult = { ok: boolean; message?: string; login?: boolean };
export type Save = (command: HouseholdCommand) => Promise<WriteResult>;

export function MutationError({ result }: { result: WriteResult | null }) {
  if (!result || result.ok) return null;
  return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
    {result.message}
    {result.login && <> <Link className="inline-flex min-h-11 items-center rounded px-2 font-semibold underline" href="/login" target="_blank" rel="noopener noreferrer">Masuk di tab baru</Link>, lalu kembali dan coba lagi.</>}
  </div>;
}
