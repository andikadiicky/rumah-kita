"use client";

import { useEffect, useId, useRef, useState } from "react";
import { buttonClass as button, inputClass as input, MutationError, type Save, type WriteResult } from "@/components/household-form";
import { categories, financeCommandSchema, kinds, people, rupiah, statuses, type Debt, type FinanceCommand, type FinanceTransaction, type Kind, type Person } from "@/lib/finance/model";

export type EditorTarget = { entity: "transaction"; item?: FinanceTransaction; payment?: Debt; paymentAmount?: string } | { entity: "debt"; item?: Debt };

export function FinanceEditor({ target, debts, date, save, busy, close }: {
  target: EditorTarget; debts: Debt[]; date: string; save: Save<FinanceCommand>; busy: boolean; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const item = target.item;
  const tx = target.entity === "transaction" ? target.item : undefined;
  const debt = target.entity === "debt" ? target.item : undefined;
  const payment = target.entity === "transaction" ? target.payment : undefined;
  const [title, setTitle] = useState(item?.title ?? (payment ? `Pembayaran ${payment.title}` : ""));
  const [kind, setKind] = useState<Kind>(payment ? payment.direction === "payable" ? "expense" : "income" : tx?.kind ?? "expense");
  const [person, setPerson] = useState<Person>(payment?.person ?? item?.person ?? "dika");
  const [destination, setDestination] = useState<Person>(tx?.destination ?? (person === "dika" ? "affi" : "dika"));
  const [category, setCategory] = useState<string>(tx?.category ?? (payment ? payment.direction === "payable" ? "kewajiban" : "piutang" : "groceries"));
  const [amount, setAmount] = useState(String(tx?.amount ?? debt?.principal ?? (target.entity === "transaction" ? target.paymentAmount : undefined) ?? payment?.remaining ?? ""));
  const [status, setStatus] = useState(tx?.status ?? "paid");
  const [when, setWhen] = useState(tx?.transaction_date ?? debt?.start_date ?? date);
  const [count, setCount] = useState(String(debt?.installment_count ?? 1));
  const [firstPayment, setFirstPayment] = useState(debt?.first_payment_date ?? debt?.start_date ?? date);
  const [due, setDue] = useState(debt?.due_date ?? "");
  const [direction, setDirection] = useState(debt?.direction ?? "payable");
  const [counterparty, setCounterparty] = useState(debt?.counterparty ?? "");
  const [debtId, setDebtId] = useState(payment?.id ?? tx?.debt_id ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [result, setResult] = useState<WriteResult | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  function field(label: string, name: string, child: React.ReactNode, hint?: string) {
    return <div className="min-w-0"><label className="mb-2 block text-sm font-medium" htmlFor={`${id}-${name}`}>{label}</label>{child}{hint && <p className="mt-2 text-xs leading-5 text-stone-500">{hint}</p>}</div>;
  }
  function changeKind(value: Kind) {
    setKind(value); setDebtId("");
    setCategory(value === "opening" ? "saldo_awal" : value === "transfer" ? "transfer" : value === "income" ? "gaji" : "groceries");
    if (value === "opening") setStatus("paid");
    setDestination(person === "dika" ? "affi" : "dika");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setResult(null);
    const common = { ...(item ? { id: item.id } : {}), title, person, notes };
    const command = financeCommandSchema.safeParse(target.entity === "debt" ? {
      entity: "debt", action: "save", data: { ...common, direction, counterparty, principal: Number(amount), installment_count: Number(count), first_payment_date: firstPayment || null, start_date: when, due_date: due || null },
    } : {
      entity: "transaction", action: "save", data: { ...common, transaction_date: when, kind, category, amount: Number(amount),
        destination: kind === "transfer" ? destination : null, status, debt_id: debtId || null },
    });
    if (!command.success) { setResult({ ok: false, message: "Periksa semua kolom: nominal harus Rupiah utuh (1–999.999.999.999), tanggal valid, dan tujuan transfer berbeda. Cicilan pertama/jatuh tempo tidak sebelum tanggal mulai; jumlah cicilan 1–360 dan tidak melebihi pokok." }); return; }
    const response = await save(command.data); setResult(response); if (response.ok) close();
  }
  async function remove() {
    if (!item) return;
    setDeleting(true); setResult(null);
    const response = await save({ entity: target.entity, action: "delete", data: { id: item.id } });
    setResult(response); setDeleting(false); if (response.ok) close();
  }
  const compatibleDebts = debts.filter((d) => d.person === person && (d.direction === "payable" ? kind === "expense" : kind === "income"));
  return <dialog ref={dialog} aria-labelledby={`${id}-heading`} onCancel={(e) => { e.preventDefault(); if (!busy) close(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 text-emerald-950 shadow-xl backdrop:bg-stone-950/40 sm:p-7">
    <h2 id={`${id}-heading`} className="mb-5 text-2xl font-semibold">{payment ? "Catat pembayaran" : target.entity === "debt" ? item ? "Ubah utang / piutang" : "Tambah utang / piutang" : item ? "Ubah transaksi" : "Tambah transaksi"}</h2>
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={busy || confirm} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="sr-only">Detail keuangan</legend>
        {field("Keterangan", "title", <input autoFocus required maxLength={200} id={`${id}-title`} aria-label="Keterangan" className={input} value={title} onChange={(e) => setTitle(e.target.value)} />)}
        {target.entity === "debt" ? field("Jenis catatan", "direction", <select id={`${id}-direction`} value={direction} onChange={(e) => setDirection(e.target.value as "payable" | "receivable")} className={input}><option value="payable">Utang — kita harus membayar</option><option value="receivable">Piutang — uang kita dipinjam</option></select>) : field("Jenis transaksi", "kind", <select id={`${id}-kind`} disabled={!!payment} value={kind} onChange={(e) => changeKind(e.target.value as Kind)} className={input}>{Object.entries(kinds).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>)}
        {field(target.entity === "debt" ? "Penanggung / pemilik dana" : kind === "income" || kind === "opening" ? "Dana masuk ke" : "Sumber uang", "person", <select disabled={!!payment} id={`${id}-person`} value={person} onChange={(e) => { const value = e.target.value as Person; setPerson(value); setDestination(value === "dika" ? "affi" : "dika"); setDebtId(""); }} className={input}>{Object.entries(people).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>)}
        {field(target.entity === "debt" ? "Pokok (Rp)" : "Nominal (Rp)", "amount", <input id={`${id}-amount`} required inputMode="numeric" pattern="[0-9]+" maxLength={12} value={amount} onChange={(e) => setAmount(e.target.value)} className={input} placeholder="100000" />, "Angka utuh tanpa titik atau koma.")}
        {field(target.entity === "debt" ? "Tanggal mulai" : "Tanggal transaksi", "date", <input id={`${id}-date`} required type="date" min="0001-01-01" max="9999-12-31" value={when} onChange={(e) => setWhen(e.target.value)} className={input} />)}
        {target.entity === "debt" ? <>
          {field("Jumlah cicilan", "count", <input id={`${id}-count`} type="number" min={1} max={360} step={1} required value={count} onChange={(e) => setCount(e.target.value)} className={input} />)}
          {field("Cicilan pertama", "first-payment", <input id={`${id}-first-payment`} type="date" required min={when || "0001-01-01"} value={firstPayment} onChange={(e) => setFirstPayment(e.target.value)} className={input} />)}
          {field("Pihak lain", "counterparty", <input id={`${id}-counterparty`} required maxLength={200} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} className={input} placeholder="Nama orang / bank" />)}
          {field("Jatuh tempo (opsional)", "due", <input id={`${id}-due`} type="date" min={when || "0001-01-01"} max="9999-12-31" value={due} onChange={(e) => setDue(e.target.value)} className={input} />)}
          <p className="text-sm leading-6 text-stone-500 sm:col-span-2">Catatan utang/piutang tidak otomatis menambah atau mengurangi uang. Catat transaksi ketika uang benar-benar berpindah; gunakan Catat pembayaran untuk cicilan/pelunasan.</p>
        </> : <>
          {field("Status", "status", <select id={`${id}-status`} disabled={kind === "opening"} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={input}>{Object.entries(statuses).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>)}
          {kind === "transfer" ? field("Dana diterima oleh", "destination", <select id={`${id}-destination`} value={destination} onChange={(e) => setDestination(e.target.value as Person)} className={input}>{Object.entries(people).filter(([v]) => v !== person).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>) : field("Kategori", "category", <select id={`${id}-category`} value={category} disabled={kind === "opening"} onChange={(e) => setCategory(e.target.value)} className={input}>{Object.entries(categories).filter(([v]) => kind === "opening" ? v === "saldo_awal" : !["transfer", "saldo_awal"].includes(v)).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>)}
          {(kind === "income" || kind === "expense") && field("Terkait utang / piutang", "debt", <select id={`${id}-debt`} disabled={!!payment} value={debtId} onChange={(e) => setDebtId(e.target.value)} className={input}><option value="">Transaksi biasa</option>{compatibleDebts.map((d) => <option key={d.id} value={d.id}>{d.title} — sisa {rupiah(d.remaining)}</option>)}</select>)}
          <p className="text-sm leading-6 text-stone-500 sm:col-span-2">Pending dan dibatalkan tidak mengubah saldo aktual. Transfer dan saldo awal tidak dihitung sebagai income/spending. Untuk patungan, catat satu transaksi per sumber dana. Saat pending menjadi paid, sesuaikan tanggal dengan tanggal uang benar-benar berpindah.</p>
        </>}
        <div className="sm:col-span-2">{field("Catatan (opsional)", "notes", <textarea id={`${id}-notes`} rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />)}</div>
      </fieldset>
      <MutationError result={result} />
      {!confirm ? <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy} className={`${button} bg-emerald-900 text-white hover:bg-emerald-800`}>{busy ? "Menyimpan…" : "Simpan"}</button><button type="button" disabled={busy} onClick={close} className={button}>Batal</button>{item && <button type="button" disabled={busy} onClick={() => setConfirm(true)} className={`${button} text-red-800`}>Hapus</button>}</div> : <div className="space-y-3 rounded-lg bg-red-50 p-4"><p>Hapus {title}? {target.entity === "debt" ? "Transaksi pembayaran tetap tersimpan dan tetap memengaruhi saldo, tetapi tidak lagi terhubung ke catatan ini." : "Saldo, ringkasan bulan, dan sisa utang terkait akan dihitung ulang."}</p><div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={remove} className={`${button} text-red-800`}>{deleting ? "Menghapus…" : "Ya, hapus"}</button><button type="button" disabled={busy} onClick={() => setConfirm(false)} className={button}>Batal</button></div></div>}
    </form>
  </dialog>;
}
