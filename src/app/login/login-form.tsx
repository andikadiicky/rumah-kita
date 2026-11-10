"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: "" });
  return (
    <form action={action} className="mt-8 space-y-5">
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required maxLength={254}
          className="w-full rounded-lg border border-stone-300 px-3 py-2" />
      </div>
      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium">Kata sandi</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024}
          className="w-full rounded-lg border border-stone-300 px-3 py-2" />
      </div>
      <p aria-live="polite" className="text-sm text-red-800">{state.error}</p>
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-emerald-900 px-4 py-3 font-medium text-white disabled:opacity-60">
        {pending ? "Sedang masuk…" : "Masuk"}
      </button>
      <p className="text-sm text-stone-500">Akun dikelola oleh pemilik rumah. Pendaftaran umum tidak tersedia.</p>
    </form>
  );
}
