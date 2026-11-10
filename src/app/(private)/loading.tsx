export default function LoadingDashboard() {
  return <div role="status" aria-live="polite" className="space-y-4"><p className="text-stone-600">Memuat ringkasan rumah…</p>{[1, 2, 3].map((id) => <div key={id} aria-hidden="true" className="h-36 animate-pulse rounded-xl bg-stone-200" />)}</div>;
}
