export default function LoadingRecipes() {
  return <div role="status" aria-live="polite" className="space-y-4"><p className="text-stone-600">Memuat resep keluarga…</p>{[1, 2, 3].map((id) => <div key={id} aria-hidden="true" className="h-28 animate-pulse rounded-2xl bg-stone-200" />)}</div>;
}
