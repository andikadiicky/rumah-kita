"use client";

import { useId, useState } from "react";
import { buttonClass as button, inputClass as input, MutationError, type Save, type WriteResult } from "@/components/household-form";
import { householdCommandSchema } from "@/lib/household/commands";
import { useHouseholdMutation } from "@/lib/household/use-household-mutation";
import { recipeEntriesToText, recipeTextToEntries, type Recipe } from "@/lib/recipes/model";

function RecipeForm({ recipe, save, busy, onDone }: { recipe?: Recipe; save: Save; busy: boolean; onDone: () => void }) {
  const id = useId();
  const [name, setName] = useState(recipe?.name ?? "");
  const [servings, setServings] = useState(String(recipe?.servings ?? 2));
  const [ingredients, setIngredients] = useState(recipeEntriesToText(recipe?.ingredients ?? []));
  const [steps, setSteps] = useState(recipeEntriesToText(recipe?.steps ?? []));
  const [result, setResult] = useState<WriteResult | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const command = householdCommandSchema.safeParse({
      entity: "recipe", action: "save",
      data: { ...(recipe ? { id: recipe.id } : {}), name, servings: Number(servings),
        ingredients: recipeTextToEntries(ingredients), steps: recipeTextToEntries(steps) },
    });
    if (!command.success) {
      setResult({ ok: false, message: "Isi nama (1–200 karakter), porsi (1–1.000), bahan, dan langkah memasak. Gunakan maksimal 200 bagian per kolom, masing-masing hingga 2.000 karakter." });
      return;
    }
    const response = await save(command.data);
    setResult(response);
    if (response.ok) onDone();
  }

  return <form onSubmit={submit} className="space-y-5">
    <fieldset disabled={busy} className="space-y-5">
      <legend className="sr-only">{recipe ? `Ubah ${recipe.name}` : "Resep baru"}</legend>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <div>
          <label htmlFor={`${id}-name`} className="mb-2 block text-sm font-medium">Nama resep</label>
          <input autoFocus id={`${id}-name`} name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} className={input} placeholder="Contoh: Nasi goreng keluarga" />
        </div>
        <div>
          <label htmlFor={`${id}-servings`} className="mb-2 block text-sm font-medium">Porsi</label>
          <input id={`${id}-servings`} name="servings" type="number" inputMode="numeric" min={1} max={1000} step={1} required value={servings} onChange={(e) => setServings(e.target.value)} className={input} />
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label htmlFor={`${id}-ingredients`} className="mb-2 block text-sm font-medium">Bahan-bahan</label>
          <p id={`${id}-ingredients-hint`} className="mb-2 text-sm text-stone-500">Tulis bahan dan takarannya, satu per baris.</p>
          <textarea id={`${id}-ingredients`} name="ingredients" rows={9} required value={ingredients} onChange={(e) => setIngredients(e.target.value)} aria-describedby={`${id}-ingredients-hint`} className={`${input} resize-y leading-7`} placeholder={"2 piring nasi\n2 butir telur\nGaram secukupnya"} />
        </div>
        <div>
          <label htmlFor={`${id}-steps`} className="mb-2 block text-sm font-medium">Langkah memasak</label>
          <p id={`${id}-steps-hint`} className="mb-2 text-sm text-stone-500">Pisahkan langkah dengan baris baru.</p>
          <textarea id={`${id}-steps`} name="steps" rows={9} required value={steps} onChange={(e) => setSteps(e.target.value)} aria-describedby={`${id}-steps-hint`} className={`${input} resize-y leading-7`} placeholder={"Panaskan minyak.\nMasukkan telur, lalu orak-arik.\nTambahkan nasi dan bumbu."} />
        </div>
      </div>
    </fieldset>
    <MutationError result={result} />
    <div className="flex flex-wrap gap-3">
      <button disabled={busy} type="submit" className={`${button} border-emerald-900 bg-emerald-900 text-white hover:bg-emerald-800`}>{busy ? "Menyimpan…" : recipe ? "Simpan perubahan" : "Simpan resep"}</button>
      <button disabled={busy} type="button" onClick={onDone} className={button}>Batal</button>
    </div>
  </form>;
}

function RecipeCard({ recipe, save, busy }: { recipe: Recipe; save: Save; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<WriteResult | null>(null);
  const id = useId();

  async function remove() {
    setDeleting(true);
    setResult(null);
    const response = await save({ entity: "recipe", action: "delete", data: { id: recipe.id } });
    setResult(response);
    setDeleting(false);
    if (response.ok) setConfirmDelete(false);
  }

  return <article aria-label={recipe.name} className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h3 className="text-xl font-semibold break-words">{recipe.name}</h3><p className="mt-1 text-sm text-stone-500">{recipe.servings} porsi</p></div>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy || confirmDelete || editing} onClick={() => { setEditing(true); setResult(null); }} className={button}>Ubah</button>
        <button disabled={busy || editing || confirmDelete} onClick={() => { setConfirmDelete(true); setResult(null); }} className={`${button} text-red-800`}>Hapus</button>
      </div>
    </div>
    {editing ? <RecipeForm recipe={recipe} busy={busy} save={save} onDone={() => setEditing(false)} /> : <details>
      <summary className="min-h-11 cursor-pointer rounded-lg py-3 font-medium text-emerald-900">Lihat resep</summary>
      <div className="mt-4 grid min-w-0 gap-6 md:grid-cols-2">
        <section aria-labelledby={`${id}-ingredients`} className="min-w-0"><h4 id={`${id}-ingredients`} className="mb-3 font-semibold">Bahan-bahan</h4><p className="leading-7 whitespace-pre-wrap break-words">{recipeEntriesToText(recipe.ingredients)}</p></section>
        <section aria-labelledby={`${id}-steps`} className="min-w-0"><h4 id={`${id}-steps`} className="mb-3 font-semibold">Langkah memasak</h4><p className="leading-7 whitespace-pre-wrap break-words">{recipeEntriesToText(recipe.steps)}</p></section>
      </div>
    </details>}
    {confirmDelete && <div className="mt-4 space-y-3 rounded-lg border border-red-100 bg-red-50 p-4">
      <p className="font-medium">Hapus resep {recipe.name}?</p>
      <p className="text-sm leading-6 text-stone-600">Resep akan dihapus permanen. Jadwal makan yang memakai resep ini tetap tersimpan beserta nama resep saat dijadwalkan, tetapi tidak lagi terhubung ke resep ini.</p>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} onClick={remove} className={`${button} border-red-200 text-red-800`}>{deleting ? "Menghapus…" : "Ya, hapus resep"}</button>
        <button disabled={busy} onClick={() => { setConfirmDelete(false); setResult(null); }} className={button}>Batal</button>
      </div>
    </div>}
    {result && <div className="mt-3"><MutationError result={result} /></div>}
  </article>;
}

export function RecipesClient({ recipes }: { recipes: Recipe[] }) {
  const [adding, setAdding] = useState(false);
  const { save, refresh, saving, refreshing, busy, announcement } = useHouseholdMutation({
    missing: "Resep tidak ditemukan. Muat ulang daftar untuk melihat perubahan terbaru.",
    invalid: "Perubahan ditolak. Periksa nama, porsi, bahan, dan langkah, lalu coba simpan lagi.",
    saved: "Resep berhasil disimpan.", deleted: "Resep berhasil dihapus. Jadwal makan tetap menyimpan nama resep.",
  });
  return <section className="space-y-8" aria-busy={busy}>
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><p className="mb-3 text-sm font-medium uppercase tracking-widest text-amber-800">Rumah Kita</p><h1 className="text-3xl font-semibold sm:text-4xl">Resep keluarga</h1><p className="mt-3 text-stone-600">Simpan bahan, takaran, dan langkah masakan favorit keluarga.</p></div>
      <button disabled={busy || adding} onClick={() => setAdding(true)} className={`${button} border-emerald-900 bg-emerald-900 text-white hover:bg-emerald-800`}>Tambah resep</button>
    </div>
    {adding && <section aria-labelledby="new-recipe" className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
      <h2 id="new-recipe" className="mb-5 text-xl font-semibold">Resep baru</h2>
      <RecipeForm save={save} busy={busy} onDone={() => setAdding(false)} />
    </section>}
    <section aria-labelledby="recipe-list" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="recipe-list" className="text-xl font-semibold">Koleksi resep <span className="text-base font-normal text-stone-500">({recipes.length})</span></h2>
        <button disabled={busy} onClick={refresh} className={button}>{refreshing ? "Memuat…" : "Muat ulang daftar"}</button>
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-emerald-900">{saving ? "Menyimpan perubahan…" : refreshing ? "Memuat resep terbaru…" : announcement}</p>
      {recipes.length === 0 ? <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center"><h3 className="text-lg font-semibold">Belum ada resep keluarga</h3><p className="mt-2 text-stone-600">Pilih Tambah resep untuk mencatat masakan favorit pertama Anda.</p></div>
        : <div className="space-y-4">{recipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} save={save} busy={busy} />)}</div>}
    </section>
  </section>;
}
