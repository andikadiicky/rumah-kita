"use client";

import { useEffect, useId, useRef, useState } from "react";
import { householdCommandSchema, type HouseholdCommand } from "@/lib/household/commands";
import { todayInJakarta } from "@/lib/date";
import {
  formatPurchaseDate, isOverdue, matchesFilter, needsBuying, purchasedCommand, statusLabels,
  type Essential, type EssentialFilter, type EssentialStatus,
} from "@/lib/essentials/model";

import { buttonClass as button, inputClass as input, MutationError, type Save, type WriteResult } from "@/components/household-form";
import { useHouseholdMutation } from "@/lib/household/use-household-mutation";

function EssentialForm({ item, save, busy, onDone }: { item?: Essential; save: Save; busy: boolean; onDone?: () => void }) {
  const prefix = useId();
  const [name, setName] = useState(item?.name ?? "");
  const [status, setStatus] = useState<EssentialStatus>(item?.status ?? "to_buy");
  const [date, setDate] = useState(item?.planned_purchase_date ?? "");
  const [result, setResult] = useState<WriteResult | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const command = householdCommandSchema.safeParse({
      entity: "essential", action: "save",
      data: { ...(item ? { id: item.id } : {}), name, status, planned_purchase_date: date || null },
    });
    if (!command.success) {
      setResult({ ok: false, message: "Isi nama barang (1–200 karakter), status, dan tanggal yang valid, lalu simpan lagi." });
      return;
    }
    const response = await save(command.data);
    setResult(response);
    if (response.ok) {
      if (!item) { setName(""); setStatus("to_buy"); setDate(""); nameRef.current?.focus(); }
      onDone?.();
    }
  }

  return <form onSubmit={submit} className="space-y-4">
    <fieldset disabled={busy} className="grid gap-4 @min-[640px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <legend className="sr-only">{item ? `Ubah ${item.name}` : "Tambah kebutuhan"}</legend>
      <div>
        <label htmlFor={`${prefix}-name`} className="mb-2 block text-sm font-medium">Nama barang</label>
        <input ref={nameRef} autoFocus={!!item} id={`${prefix}-name`} name="name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Beras" className={input} />
      </div>
      <div>
        <label htmlFor={`${prefix}-status`} className="mb-2 block text-sm font-medium">Status</label>
        <select id={`${prefix}-status`} name="status" value={status} onChange={(e) => setStatus(e.target.value as EssentialStatus)} className={input}>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${prefix}-date`} className="mb-2 block text-sm font-medium">Rencana beli <span className="font-normal text-stone-500">(opsional)</span></label>
        <input id={`${prefix}-date`} name="planned_purchase_date" type="date" min="0001-01-01" max="9999-12-31" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
      </div>
    </fieldset>
    <MutationError result={result} />
    <div className="flex flex-wrap gap-3">
      <button type="submit" disabled={busy} className={`${button} border-emerald-900 bg-emerald-900 text-white hover:bg-emerald-800`}>
        {busy ? "Menyimpan…" : item ? "Simpan perubahan" : "Tambah barang"}
      </button>
      {item && <button type="button" onClick={onDone} disabled={busy} className={button}>Batal</button>}
    </div>
  </form>;
}

function EssentialCard({ item, today, save, busy }: { item: Essential; today: string; save: Save; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [result, setResult] = useState<WriteResult | null>(null);

  async function mutate(command: HouseholdCommand, action: string) {
    setPendingAction(action);
    setResult(null);
    const response = await save(command);
    setResult(response);
    setPendingAction(null);
    if (response.ok) setConfirmDelete(false);
  }

  return <li className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm md:px-4 md:py-3" aria-label={item.name}>
    <div className="grid items-center gap-4 @min-[640px]:grid-cols-[minmax(0,1.2fr)_7rem_8rem_minmax(15rem,auto)] md:gap-3">
      <h3 className="min-w-0 text-lg font-semibold break-words md:text-base">{item.name}</h3>
      <span className={`w-fit rounded-full px-3 py-1 text-sm font-medium ${item.status === "in_stock" ? "bg-emerald-50 text-emerald-900" : item.status === "out_of_stock" ? "bg-rose-50 text-rose-900" : "bg-amber-50 text-amber-900"}`}>{statusLabels[item.status]}</span>
      <div className="text-sm text-stone-600">
        <span className="block text-xs text-stone-500 @min-[640px]:sr-only">Rencana beli</span>
        {item.planned_purchase_date ? <time dateTime={item.planned_purchase_date}>{formatPurchaseDate(item.planned_purchase_date)}</time> : "Belum dijadwalkan"}
        {isOverdue(item, today) && <span className="mt-1 block w-fit rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900">Terlambat</span>}
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        {needsBuying(item) && <button disabled={busy || editing || confirmDelete} onClick={() => mutate(purchasedCommand(item), "purchased")} className={`${button} border-emerald-200 text-emerald-900`}>
          {pendingAction === "purchased" ? "Menyimpan…" : "Sudah Dibeli"}
        </button>}
        <button disabled={busy || confirmDelete} onClick={() => { setEditing(!editing); setResult(null); }} aria-expanded={editing} className={button}>{editing ? "Tutup" : "Ubah"}</button>
        <button disabled={busy || editing} onClick={() => { setConfirmDelete(true); setResult(null); }} className={`${button} text-red-800`}>Hapus</button>
      </div>
    </div>
    {editing && <div className="mt-5 border-t border-stone-200 pt-5"><EssentialForm item={item} busy={busy} save={save} onDone={() => setEditing(false)} /></div>}
    {confirmDelete && <div className="mt-4 space-y-3 rounded-lg bg-stone-50 p-4">
      <p>Hapus <strong>{item.name}</strong>? Barang ini akan dihapus dari daftar.</p>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => mutate({ entity: "essential", action: "delete", data: { id: item.id } }, "delete")} className={`${button} border-red-200 text-red-800`}>{pendingAction === "delete" ? "Menghapus…" : "Ya, hapus"}</button>
        <button disabled={busy} onClick={() => { setConfirmDelete(false); setResult(null); }} className={button}>Batal</button>
      </div>
    </div>}
    {result && <div className="mt-3"><MutationError result={result} /></div>}
  </li>;
}

export function EssentialsClient({ items, today: initialToday, initialFilter = "all" }: { items: Essential[]; today: string; initialFilter?: EssentialFilter }) {
  const [filter, setFilter] = useState<EssentialFilter>(initialFilter);
  const { save, refresh, saving, refreshing, busy, announcement } = useHouseholdMutation({
    missing: "Barang ini tidak ditemukan. Muat ulang daftar untuk melihat perubahan terbaru.",
    invalid: "Perubahan ditolak. Periksa nama, status, dan tanggal, lalu coba simpan lagi.",
    saved: "Kebutuhan rumah berhasil disimpan.", deleted: "Barang berhasil dihapus.",
  });
  const [today, setToday] = useState(initialToday);
  useEffect(() => {
    const update = () => setToday(todayInJakarta());
    const timer = setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);

  const filtered = items.filter((item) => matchesFilter(item, filter));
  const filters = [["all", "Semua"], ["to_buy", "Perlu Dibeli"], ["out_of_stock", "Habis"], ["in_stock", "Tersedia"]] as const;
  return <section className="space-y-8" aria-busy={busy}>
    <div><p className="mb-3 text-sm font-medium uppercase tracking-widest text-amber-800">Rumah Kita</p><h1 className="text-3xl font-semibold sm:text-4xl">Kebutuhan rumah</h1><p className="mt-3 text-stone-600">Catat persediaan dan rencanakan belanja berikutnya.</p></div>
    <section aria-labelledby="add-heading" className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
      <h2 id="add-heading" className="mb-5 text-xl font-semibold">Tambah kebutuhan</h2>
      <EssentialForm save={save} busy={busy} />
    </section>
    <section aria-labelledby="list-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="list-heading" className="text-xl font-semibold">Daftar barang <span className="text-base font-normal text-stone-500">({items.length})</span></h2>
        <button disabled={busy} onClick={refresh} className={button}>{refreshing ? "Memuat…" : "Muat ulang daftar"}</button>
      </div>
      <div aria-label="Filter kebutuhan" className="flex flex-wrap gap-2">
        {filters.map(([value, label]) => <button key={value} type="button" disabled={busy} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`${button} ${filter === value ? "border-emerald-900 bg-emerald-900 text-white hover:bg-emerald-800" : "bg-white"}`}>
          {label} ({items.filter((item) => matchesFilter(item, value)).length})
        </button>)}
      </div>
      <p className="text-sm text-stone-500">Perlu Dibeli mencakup barang berstatus Perlu Dibeli dan Habis. Tanggal mengikuti waktu Jakarta.</p>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-emerald-900">{saving ? "Menyimpan perubahan…" : refreshing ? "Memuat daftar terbaru…" : announcement}</p>
      {filtered.length === 0 ? <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center">
        <h3 className="text-lg font-semibold">{items.length === 0 ? "Belum ada kebutuhan rumah" : filter === "to_buy" ? "Tidak ada barang yang perlu dibeli" : "Tidak ada barang yang habis"}</h3>
        <p className="mt-2 text-stone-600">{items.length === 0 ? "Tambahkan barang pertama melalui formulir di atas." : "Pilih Semua untuk melihat barang lainnya."}</p>
      </div> : <>
        <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.2fr)_7rem_8rem_minmax(15rem,auto)] gap-3 px-4 text-xs font-semibold uppercase tracking-wide text-stone-500 @min-[640px]:grid"><span>Barang</span><span>Status</span><span>Rencana beli</span><span className="text-right">Tindakan</span></div>
        <ul className="space-y-3 md:space-y-2">{filtered.map((item) => <EssentialCard key={item.id} item={item} today={today} save={save} busy={busy} />)}</ul>
      </>}
    </section>
  </section>;
}
