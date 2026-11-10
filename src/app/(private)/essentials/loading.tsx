export default function LoadingEssentials() {
  return <div role="status" className="space-y-4" aria-live="polite">
    <p className="text-stone-600">Memuat kebutuhan rumah…</p>
    {[1, 2, 3].map((id) => <div key={id} className="h-24 animate-pulse rounded-xl bg-stone-200" aria-hidden="true" />)}
  </div>;
}
