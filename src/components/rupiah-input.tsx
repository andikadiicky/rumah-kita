"use client";

import { useRef } from "react";
import { inputClass } from "./household-form";
import { formatMoneyInput, moneyInputDigits } from "@/lib/finance/model";

export function RupiahInput({ id, value, onValueChange }: { id: string; value: string; onValueChange: (value: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return <div className="relative"><span aria-hidden="true" className="pointer-events-none absolute top-3 left-3 text-stone-500">Rp</span>
    <input ref={ref} id={id} type="text" inputMode="numeric" required pattern="[0-9,]+"
      value={formatMoneyInput(value)} className={`${inputClass} pl-12`} placeholder="100,000"
      onChange={(event) => {
        const input = event.currentTarget;
        const before = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, "").length;
        const digits = moneyInputDigits(input.value);
        if (digits === null) { input.value = formatMoneyInput(value); return; }
        onValueChange(digits);
        const formatted = formatMoneyInput(digits);
        requestAnimationFrame(() => {
          if (!ref.current || document.activeElement !== ref.current) return;
          let seen = 0; let caret = 0;
          while (caret < formatted.length && seen < before) { if (/\d/.test(formatted[caret])) seen++; caret++; }
          ref.current.setSelectionRange(caret, caret);
        });
      }} />
  </div>;
}
