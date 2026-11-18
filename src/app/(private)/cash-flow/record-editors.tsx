"use client";

import { useEffect, useId, useRef, useState } from "react";
import { buttonClass as button, inputClass as input, MutationError, type Save, type WriteResult } from "@/components/household-form";
import { RupiahInput } from "@/components/rupiah-input";
import { financeCommandSchema, statuses, type FinanceCommand } from "@/lib/finance/model";
import type { EditorTarget } from "./finance-editor";

export function RecordEditor({ target, date, save, busy, close }: {
  target: Extract<EditorTarget, { entity: "category" | "debt_payment" }>; date: string; save: Save<FinanceCommand>; busy: boolean; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const category = target.entity === "category" ? target.item : undefined;
  const payment = target.entity === "debt_payment" ? target.item : undefined;
  const [label, setLabel] = useState(category?.label ?? "");
  const [amount, setAmount] = useState(String(payment?.amount ?? (target.entity === "debt_payment" ? target.paymentAmount ?? target.debt.remaining : "")));
  const [when, setWhen] = useState(payment?.payment_date ?? date);
  const [status, setStatus] = useState(payment?.status ?? "paid");
  const [notes, setNotes] = useState(payment?.notes ?? "");
  const [result, setResult] = useState<WriteResult | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setResult(null);
    const command = financeCommandSchema.safeParse(target.entity === "category" ? {
      entity: "category", action: "save", data: { ...(category ? { id: category.id } : {}), label },
    } : {
      entity: "debt_payment", action: "save", data: { ...(payment ? { id: payment.id } : {}), debt_id: target.debt.id,
        payment_date: when, amount: Number(amount), status, notes },
    });
    if (!command.success) { setResult({ ok: false, message: target.entity === "category" ? "Isi nama kategori 1–80 karakter." : "Periksa tanggal, nominal Rupiah utuh, dan status catatan." }); return; }
    const response = await save(command.data);
    setResult(target.entity === "category" && !response.ok && !response.login ? { ...response, message: "Kategori belum disimpan. Pastikan nama unik (1–80 karakter), periksa koneksi, lalu coba lagi." } : response);
    if (response.ok) close();
  }
  async function remove() {
    if (!payment) return;
    const response = await save({ entity: "debt_payment", action: "delete", data: { id: payment.id } });
    setResult(response); if (response.ok) close();
  }
  return <dialog ref={dialog} aria-labelledby={`${id}-heading`} onCancel={(e) => { e.preventDefault(); if (!busy) close(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 text-emerald-950 shadow-xl backdrop:bg-stone-950/40 sm:p-7">
    <h2 id={`${id}-heading`} className="mb-5 text-2xl font-semibold">{target.entity === "category" ? category ? "Ubah kategori" : "Tambah kategori" : payment ? "Ubah catatan pembayaran" : "Catat pembayaran"}</h2>
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={busy || confirm} className="space-y-4">
        <legend className="sr-only">Detail catatan</legend>
        {target.entity === "category" ? <>
          <div><label htmlFor={`${id}-label`} className="mb-2 block text-sm font-medium">Nama kategori</label><input autoFocus id={`${id}-label`} required maxLength={80} className={input} value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <p className="text-sm text-stone-500">Nama baru berlaku pada dropdown, pivot, diagram, dan seluruh transaksi yang memakai kategori ini. Kode kategori tetap sama.</p>
        </> : <>
          <p className="font-medium">{target.debt.title}</p><p className="rounded-lg bg-emerald-50 p-3 text-sm">Hanya memperbarui debt tracker. Tidak mengurangi atau menambah saldo sumber uang dan tidak membuat transaksi kas.</p>
          <div><label htmlFor={`${id}-amount`} className="mb-2 block text-sm font-medium">Nominal (Rp)</label><RupiahInput id={`${id}-amount`} value={amount} onValueChange={setAmount} /></div>
          <div><label htmlFor={`${id}-date`} className="mb-2 block text-sm font-medium">Tanggal pembayaran</label><input id={`${id}-date`} required type="date" min={target.debt.start_date} max="9999-12-31" className={input} value={when} onChange={(e) => setWhen(e.target.value)} /></div>
          <div><label htmlFor={`${id}-status`} className="mb-2 block text-sm font-medium">Status</label><select id={`${id}-status`} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={input}>{Object.entries(statuses).map(([v, name]) => <option key={v} value={v}>{name}</option>)}</select></div>
          <div><label htmlFor={`${id}-notes`} className="mb-2 block text-sm font-medium">Catatan (opsional)</label><textarea id={`${id}-notes`} rows={3} maxLength={2000} className={input} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </>}
      </fieldset>
      <MutationError result={result} />
      {!confirm ? <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy} className={`${button} bg-emerald-900 text-white hover:bg-emerald-800`}>{busy ? "Menyimpan…" : "Simpan"}</button><button type="button" disabled={busy} className={button} onClick={close}>Batal</button>{payment && <button type="button" disabled={busy} className={`${button} text-red-800`} onClick={() => setConfirm(true)}>Hapus</button>}</div> : <div className="space-y-3 rounded-lg bg-red-50 p-4"><p>Hapus catatan pembayaran ini? Sisa pokok akan dihitung ulang; transaksi kas dan saldo tidak berubah.</p><button type="button" disabled={busy} onClick={remove} className={`${button} text-red-800`}>Ya, hapus</button><button type="button" disabled={busy} onClick={() => setConfirm(false)} className={`${button} ml-2`}>Batal</button></div>}
    </form>
  </dialog>;
}
