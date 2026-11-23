"use client";

import { ArcElement, Chart as ChartJS, Tooltip } from "chart.js";
import { Pie } from "react-chartjs-2";
import { categorySlices, rupiah, type FinanceReport } from "@/lib/finance/model";

ChartJS.register(ArcElement, Tooltip);

export function CategoryPie({ report }: { report: FinanceReport }) {
  const slices = categorySlices(report.pivot).sort((a, b) => BigInt(a.paid) > BigInt(b.paid) ? -1 : BigInt(a.paid) < BigInt(b.paid) ? 1 : a.category.localeCompare(b.category));
  const labels = Object.fromEntries(report.categories.map((c) => [c.code, c.label]));
  const share = (value: number) => `${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
  // Only chart geometry uses floating point; labels keep the exact integer-rupiah totals.
  const largest = slices.length ? BigInt(slices[0].paid) : BigInt(1);
  return <section aria-labelledby="pie-title" className="rounded-xl border border-stone-200 bg-white p-4 sm:p-6">
    <h2 id="pie-title" className="text-xl font-semibold">Komposisi pengeluaran per kategori</h2>
    <p className="mt-2 mb-5 text-sm text-stone-500">Pengeluaran sudah dibayar pada bulan terpilih, dari nominal terbesar. Sentuh atau arahkan kursor pada irisan untuk melihat nominal, persentase, dan sumber dana. Pending tidak dimasukkan.</p>
    {slices.length ? <><p className="mb-5 text-sm text-stone-600">Total dibayar <strong className="text-lg text-stone-900">{rupiah(report.spending)}</strong></p><div className="grid min-w-0 items-center gap-6 @min-[640px]:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <div className="relative mx-auto aspect-square w-full max-w-75">
        <Pie role="img" aria-label={`Diagram pie spending dibayar, total ${rupiah(report.spending)}. Rincian kategori tersedia di legenda.`} data={{
          labels: slices.map((s) => labels[s.category] ?? s.category),
          datasets: [{ data: slices.map((s) => Number(BigInt(s.paid)) / Number(largest)), backgroundColor: slices.map((s) => s.color), borderColor: "#ffffff", borderWidth: 2, hoverOffset: 8 }],
        }} options={{ responsive: true, maintainAspectRatio: false, layout: { padding: 12 }, animation: false,
          plugins: { tooltip: { displayColors: true, callbacks: {
            label: (context) => { const s = slices[context.dataIndex]; return `${rupiah(s.paid)} · ${share(s.share)}`; },
            afterLabel: (context) => { const s = slices[context.dataIndex]; return [`Dika: ${rupiah(s.dika)}`, `Affi: ${rupiah(s.affi)}`]; },
          } } },
        }} />
      </div>
      <ul aria-label="Legenda pengeluaran per kategori" className="min-w-0 space-y-3">{slices.map((s) => <li key={s.category} className="flex min-w-0 items-start gap-3"><span aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 rounded" style={{ backgroundColor: s.color }} /><div className="min-w-0"><p className="font-medium break-words">{labels[s.category] ?? s.category}</p><p className="text-sm text-stone-600">{rupiah(s.paid)} · {share(s.share)}</p><p className="text-xs leading-5 text-stone-500">Dika {rupiah(s.dika)} · Affi {rupiah(s.affi)}</p></div></li>)}</ul>
    </div></> : <p className="rounded-lg bg-stone-50 p-4 text-sm text-stone-600">Belum ada pengeluaran dibayar untuk diagram bulan ini.</p>}
  </section>;
}
