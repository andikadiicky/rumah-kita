"use client";

import Link from "next/link";

export default function MealPlanError({ reset }: { reset: () => void }) {
  return <section role="alert" className="rounded-2xl border border-red-200 bg-white p-6"><h1 className="text-2xl font-semibold">Rencana makan belum dapat dimuat</h1><p className="my-4 text-stone-600">Periksa koneksi internet, lalu coba lagi. Minggu yang dipilih tetap ada di alamat halaman.</p><div className="flex flex-wrap gap-4"><button onClick={reset} className="min-h-11 rounded-lg bg-emerald-900 px-4 py-2 text-white">Coba lagi</button><Link href="/login" className="flex min-h-11 items-center rounded-lg px-3 underline">Masuk kembali</Link></div></section>;
}
