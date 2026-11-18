"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { buttonClass as button } from "@/components/household-form";
import { monthLabel, people, rupiah, type FinanceReport } from "@/lib/finance/model";
import type { CategoryDetails } from "@/lib/finance/category-details";

type Result = { page: number; attempt: number; report: FinanceReport; data?: CategoryDetails; error?: string; login?: boolean };
export function CategoryDetailsDialog({ month, category, label, report, close }: {
  month: string; category: string; label: string; report: FinanceReport; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const current = result?.page === page && result.attempt === attempt && result.report === report ? result : null;
  const pivot = report.pivot.find((row) => row.category === category);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/finance/category-details?${new URLSearchParams({ month, category, page: String(page) })}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? "login" : "load");
        const data: CategoryDetails = await response.json();
        if (!controller.signal.aborted) setResult({ page, attempt, report, data });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ page, attempt, report, error: "Rincian belum dapat dimuat. Periksa koneksi lalu coba lagi.", login: error instanceof Error && error.message === "login" });
      }
    }
    void load();
    return () => controller.abort();
  }, [month, category, page, attempt, report]);
  return <dialog ref={dialog} aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); close(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 text-stone-900 shadow-xl backdrop:bg-stone-950/50 sm:p-6">
    <div className="flex items-start justify-between gap-3"><h2 id={`${id}-title`} className="min-w-0 text-xl font-semibold break-words">Rincian {label}</h2><button autoFocus className={`${button} shrink-0`} onClick={close}>Tutup</button></div>
    <p className="mt-2 text-sm text-stone-600">{monthLabel(month)} · Pengeluaran dibayar dan pending. Transaksi dibatalkan tidak dihitung.</p>
    {pivot && <div className="my-4 grid grid-cols-2 gap-3 text-sm"><p className="min-w-0 break-words">Sudah dibayar<strong className="block">{rupiah(pivot.paid)}</strong></p><p className="min-w-0 break-words">Pending<strong className="block">{rupiah(pivot.pending)}</strong></p></div>}
    <div tabIndex={0} role="region" aria-label="Daftar rincian transaksi" aria-busy={!current}>
      {!current && <p role="status" className="py-6">Memuat rincian transaksi…</p>}
      {current?.error && <div role="alert" className="space-y-3 py-4"><p>{current.login ? "Sesi berakhir. Masuk kembali untuk melihat rincian." : current.error}</p>{current.login ? <Link className={`${button} inline-flex items-center`} href="/login">Masuk kembali</Link> : <button className={button} onClick={() => setAttempt((value) => value + 1)}>Coba lagi</button>}</div>}
      {current?.data && <><p role="status" className="my-3 text-sm">{current.data.total} transaksi · Halaman {page} dari {Math.max(1, Math.ceil(current.data.total / 50))}</p>
        {current.data.transactions.length ? <ul className="space-y-3">{current.data.transactions.map((transaction) => <li key={transaction.id} className="min-w-0 rounded-lg border border-stone-200 p-3"><h3 className="font-semibold break-words">{transaction.title}</h3><p className="mt-1 text-sm text-stone-600">{transaction.transaction_date} · {people[transaction.person]} · {transaction.status === "paid" ? "Sudah dibayar" : "Pending"}</p><p className="mt-2 font-semibold break-words">{rupiah(transaction.amount)}</p>{transaction.notes && <p className="mt-2 text-sm whitespace-pre-wrap break-words">{transaction.notes}</p>}</li>)}</ul> : <p className="py-4">Tidak ada transaksi di halaman ini. Kembali ke halaman sebelumnya atau muat ulang laporan.</p>}
        <nav aria-label="Halaman rincian kategori" className="mt-4 flex flex-wrap gap-3">{page > 1 && <button className={button} onClick={() => setPage(page - 1)}>Sebelumnya</button>}{page * 50 < current.data.total && <button className={button} onClick={() => setPage(page + 1)}>Berikutnya</button>}</nav>
      </>}
    </div>
  </dialog>;
}
