"use client";
import { buttonClass } from "@/components/household-form";
export default function CashFlowError({ reset }: { reset: () => void }) {
  return <section role="alert" className="space-y-4 rounded-xl border border-red-200 bg-white p-6"><h1 className="text-2xl font-semibold">Cash flow belum dapat dimuat</h1><p>Periksa koneksi, lalu coba lagi. Hubungi pemilik aplikasi bila fitur keuangan belum diaktifkan.</p><button onClick={reset} className={buttonClass}>Coba lagi</button></section>;
}
