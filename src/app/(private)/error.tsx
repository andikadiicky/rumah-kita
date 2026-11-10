"use client";

import Link from "next/link";
import { buttonClass } from "@/components/household-form";

export default function DashboardError({ reset }: { reset: () => void }) {
  return <section role="alert" className="space-y-4 rounded-2xl border border-red-200 bg-white p-6"><h1 className="text-2xl font-semibold">Ringkasan rumah belum dapat dimuat</h1><p>Periksa koneksi internet, lalu coba lagi.</p><div className="flex flex-wrap gap-3"><button onClick={reset} className={buttonClass}>Coba lagi</button><Link href="/login" className={`${buttonClass} inline-flex items-center`}>Masuk kembali</Link></div></section>;
}
