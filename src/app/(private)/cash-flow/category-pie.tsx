import { categorySlices, rupiah, type FinanceReport } from "@/lib/finance/model";

export function CategoryPie({ report }: { report: FinanceReport }) {
  const slices = categorySlices(report.pivot);
  const labels = Object.fromEntries(report.categories.map((c) => [c.code, c.label]));
  return <section aria-labelledby="pie-title" className="rounded-xl border border-stone-200 bg-white p-4 sm:p-6">
    <h2 id="pie-title" className="text-xl font-semibold">Komposisi pengeluaran per kategori</h2>
    <p className="mt-2 mb-5 text-sm text-stone-500">Berdasarkan kolom Paid pada pivot bulan terpilih. Pending tidak dimasukkan.</p>
    {slices.length ? <div className="grid min-w-0 items-center gap-6 @min-[640px]:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
      <div role="img" aria-label={`Diagram pie spending dibayar, total ${rupiah(report.spending)}. Rincian kategori tersedia di legenda.`} className="mx-auto aspect-square w-full max-w-60 rounded-full border border-stone-100" style={{ background: `conic-gradient(${slices.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(",")})` }} />
      <ul className="min-w-0 space-y-3">{slices.map((s) => <li key={s.category} className="flex min-w-0 items-start gap-3"><span aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 rounded" style={{ backgroundColor: s.color }} /><div className="min-w-0"><p className="font-medium break-words">{labels[s.category] ?? s.category}</p><p className="text-sm text-stone-600">{rupiah(s.paid)} · {s.share.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%</p></div></li>)}</ul>
    </div> : <p className="rounded-lg bg-stone-50 p-4 text-sm text-stone-600">Belum ada pengeluaran dibayar untuk diagram bulan ini.</p>}
  </section>;
}
