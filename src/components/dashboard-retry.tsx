"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "./household-form";

export function DashboardRetry() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <button disabled={pending} className={buttonClass} onClick={() => startTransition(() => router.refresh())}>{pending ? "Memuat…" : "Coba lagi"}</button>;
}
