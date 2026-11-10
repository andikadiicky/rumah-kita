"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { buttonClass as button, inputClass as input, MutationError, type Save, type WriteResult } from "@/components/household-form";
import { useHouseholdMutation } from "@/lib/household/use-household-mutation";
import { householdCommandSchema } from "@/lib/household/commands";
import { adjacentWeek, calendarLabel, displayedMealName, mealLabels, mealTypes, mondayForDate, weekDates, type MealSlot, type MealType, type RecipeOption } from "@/lib/meal-plan/model";

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

function WeekLink({ week, busy, children }: { week: string | null; busy: boolean; children: React.ReactNode }) {
  if (!week) return <span aria-disabled="true" className={`${button} inline-flex items-center opacity-50`}>{children}</span>;
  return <Link href={`/meal-plan?week=${week}`} scroll={false} prefetch={false} aria-disabled={busy}
    onClick={(event) => { if (busy) event.preventDefault(); }} className={`${button} inline-flex items-center ${busy ? "opacity-50" : ""}`}>{children}</Link>;
}

function SlotEditor({ date, type, slot, recipes, save, busy, onClose }: {
  date: string; type: MealType; slot?: MealSlot; recipes: RecipeOption[]; save: Save; busy: boolean; onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  const linkedRecipe = recipes.find((recipe) => recipe.id === slot?.recipe_id);
  const [mode, setMode] = useState(linkedRecipe || (!slot && recipes.length) ? "recipe" : "custom");
  const [recipeId, setRecipeId] = useState(linkedRecipe?.id ?? "");
  const [name, setName] = useState(slot?.meal_name ?? "");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState<WriteResult | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const command = householdCommandSchema.safeParse({
      entity: "meal_slot", action: "save",
      data: { meal_date: date, meal_type: type,
        ...(mode === "recipe" ? { recipe_id: recipeId } : { recipe_id: null, meal_name: name }) },
    });
    if (!command.success || (mode === "recipe" && !recipes.some((recipe) => recipe.id === recipeId))) {
      setResult({ ok: false, message: "Pilih resep yang tersedia atau isi nama menu sendiri (1–200 karakter), lalu simpan lagi." });
      return;
    }
    const response = await save(command.data);
    setResult(response);
    if (response.ok) onClose();
  }

  async function clear() {
    setResult(null);
    setClearing(true);
    const response = await save({ entity: "meal_slot", action: "delete", data: { meal_date: date, meal_type: type } });
    setResult(response);
    setClearing(false);
    if (response.ok) onClose();
  }

  return <dialog ref={dialogRef} aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 text-emerald-950 shadow-xl backdrop:bg-stone-950/40 sm:p-7">
    <h2 id={`${id}-title`} className="text-2xl font-semibold">{slot ? "Ganti menu" : "Atur menu"} — {mealLabels[type]}</h2>
    <p className="mt-2 mb-6 text-sm text-stone-600">{calendarLabel(date, true)}</p>
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={busy || confirmClear} className="space-y-5">
        <legend className="sr-only">Pilihan menu</legend>
        <div><label htmlFor={`${id}-mode`} className="mb-2 block text-sm font-medium">Jenis menu</label>
          <select id={`${id}-mode`} value={mode} onChange={(event) => { setMode(event.target.value); setResult(null); }} className={input}>
            <option value="recipe" disabled={recipes.length === 0}>Resep tersimpan</option><option value="custom">Nama sendiri</option>
          </select>
        </div>
        {mode === "recipe" ? <div>
          <label htmlFor={`${id}-recipe`} className="mb-2 block text-sm font-medium">Resep</label>
          <select id={`${id}-recipe`} required value={recipeId} onChange={(event) => setRecipeId(event.target.value)} className={input}>
            <option value="" disabled>Pilih resep</option>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
          </select>
        </div> : <div>
          <label htmlFor={`${id}-name`} className="mb-2 block text-sm font-medium">Nama menu</label>
          <input id={`${id}-name`} required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className={input} placeholder="Contoh: Makan di luar" />
        </div>}
        {recipes.length === 0 && <p className="text-sm text-stone-600">Belum ada resep. Isi nama menu sendiri atau <Link href="/recipes" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded px-2 underline">buat resep di tab baru</Link>, lalu muat ulang daftar setelah menutup editor.</p>}
        <p className="text-sm text-stone-500">Menyimpan akan mengganti menu pada waktu makan ini.</p>
      </fieldset>
      <MutationError result={result} />
      {!confirmClear && <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={`${button} border-emerald-900 bg-emerald-900 text-white hover:bg-emerald-800`}>{busy ? "Menyimpan…" : "Simpan menu"}</button>
        <button type="button" disabled={busy} onClick={onClose} className={button}>Batal</button>
        {slot && <button type="button" disabled={busy} onClick={() => { setConfirmClear(true); setResult(null); }} className={`${button} text-red-800`}>Kosongkan slot</button>}
      </div>}
      {confirmClear && <div className="space-y-3 rounded-lg bg-red-50 p-4">
        <p>Kosongkan {mealLabels[type]} pada {calendarLabel(date)}? Resep di koleksi tidak akan dihapus.</p>
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={clear} className={`${button} text-red-800`}>{clearing ? "Mengosongkan…" : "Ya, kosongkan"}</button><button type="button" disabled={busy} onClick={() => { setConfirmClear(false); setResult(null); }} className={button}>Batal</button></div>
      </div>}
    </form>
  </dialog>;
}

export function MealPlanClient({ monday, today, slots, recipes }: { monday: string; today: string; slots: MealSlot[]; recipes: RecipeOption[] }) {
  const dates = weekDates(monday);
  const [selectedDay, setSelectedDay] = useState(dates.includes(today) ? today : monday);
  const [target, setTarget] = useState<{ date: string; type: MealType } | null>(null);
  const { save, refresh, saving, refreshing, busy: mutating, announcement } = useHouseholdMutation({
    missing: "Slot ini sudah kosong. Tutup editor dan muat ulang daftar untuk melihat jadwal terbaru.",
    invalid: "Menu belum dapat disimpan. Periksa nama menu atau pilih resep lain, lalu coba lagi.",
    saved: "Menu berhasil disimpan.", deleted: "Slot makan berhasil dikosongkan.",
  });
  // Disable scripted controls until hydration so early taps are not discarded.
  const hydrated = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const busy = mutating || !hydrated;
  const previous = adjacentWeek(monday, -7);
  const next = adjacentWeek(monday, 7);
  const activeSlot = target ? slots.find((slot) => slot.meal_date === target.date && slot.meal_type === target.type) : undefined;

  return <section className="space-y-6" aria-busy={busy}>
    <div><p className="mb-3 text-sm font-medium uppercase tracking-widest text-amber-800">Rumah Kita</p><h1 className="text-3xl font-semibold sm:text-4xl">Rencana makan</h1><p className="mt-3 text-stone-600">Rencanakan menu keluarga dari Senin hingga Minggu.</p></div>
    <nav aria-label="Navigasi minggu" className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="text-lg font-semibold"><time dateTime={monday}>{calendarLabel(monday)}</time> – <time dateTime={dates[6]}>{calendarLabel(dates[6])}</time></h2>
      <div className="flex flex-wrap gap-2">
        <WeekLink week={previous} busy={busy}>← Minggu sebelumnya</WeekLink>
        <WeekLink week={mondayForDate(today)} busy={busy}>Minggu ini</WeekLink>
        <WeekLink week={next} busy={busy}>Minggu berikutnya →</WeekLink>
        <button disabled={busy} onClick={refresh} className={button}>Muat ulang jadwal</button>
      </div>
    </nav>
    <p role="status" aria-live="polite" className="min-h-5 text-sm text-emerald-900">{saving ? "Menyimpan menu…" : refreshing ? "Memuat jadwal terbaru…" : announcement}</p>
    {slots.length === 0 && <p className="rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-600">Belum ada menu minggu ini. Pilih waktu makan untuk mulai merencanakan.</p>}
    <div className="gap-6 md:grid md:grid-cols-[11rem_minmax(0,1fr)] xl:block">
      <div aria-label="Pilih hari" className="mb-5 grid grid-cols-7 gap-1 md:mb-0 md:flex md:flex-col md:gap-2 xl:hidden">
        {dates.map((date, index) => <button key={date} disabled={busy} aria-pressed={selectedDay === date} aria-label={calendarLabel(date, true)} onClick={() => setSelectedDay(date)}
          className={`min-h-14 min-w-0 rounded-lg border px-1 py-2 text-center text-sm md:px-3 md:text-left ${date === selectedDay ? "border-emerald-900 bg-emerald-900 text-white" : "border-stone-200 bg-white hover:bg-stone-100"} disabled:opacity-50`}>
          <span className="block font-medium">{["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"][index]}</span><span className="block text-xs">{Number(date.slice(8))}/{Number(date.slice(5, 7))}</span>{date === today && <span className="block text-[10px]">Hari ini</span>}
        </button>)}
      </div>
      <div className="min-w-0 xl:grid xl:grid-cols-7 xl:items-start xl:gap-2">
        {dates.map((date) => <section key={date} aria-label={calendarLabel(date, true)} className={`${selectedDay === date ? "block" : "hidden xl:block"} min-w-0 space-y-3`}>
          <h2 className={`min-h-16 rounded-lg px-2 py-3 text-center text-sm font-semibold ${date === today ? "bg-emerald-100 text-emerald-950" : "bg-stone-100"}`}>
            <span className="block">{new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}</span>
            <time dateTime={date} className="mt-1 block text-xs font-normal">{calendarLabel(date)}</time>{date === today && <span className="mt-1 block text-xs">Hari ini</span>}
          </h2>
          {mealTypes.map((type) => {
            const slot = slots.find((item) => item.meal_date === date && item.meal_type === type);
            return <article key={type} aria-label={mealLabels[type]} className="flex min-h-40 min-w-0 flex-col rounded-xl border border-stone-200 bg-white p-4 xl:min-h-48 xl:p-3">
              <h3 className="text-sm font-semibold text-stone-500">{mealLabels[type]}</h3>
              <p className="my-3 flex-1 text-base font-medium break-words">{slot ? displayedMealName(slot, recipes) : "Belum ada menu"}</p>
              {slot?.recipe_id && recipes.some((recipe) => recipe.id === slot.recipe_id) && <p className="mb-3 text-xs text-stone-500">Resep tersimpan</p>}
              <button disabled={busy} onClick={() => setTarget({ date, type })} className={`${button} w-full px-2`}>{slot ? "Ganti / kosongkan" : "Atur menu"}</button>
            </article>;
          })}
        </section>)}
      </div>
    </div>
    {target && <SlotEditor key={`${target.date}-${target.type}`} date={target.date} type={target.type} slot={activeSlot} recipes={recipes} save={save} busy={busy} onClose={() => setTarget(null)} />}
  </section>;
}
