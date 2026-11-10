import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getAuthenticatedUser()) redirect("/");
  return (
    <AppShell>
      <section className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-8 sm:my-12">
        <p className="text-sm font-medium uppercase tracking-widest text-amber-800">Selamat datang</p>
        <h1 className="mt-3 text-3xl font-semibold">Masuk ke Rumah Kita</h1>
        <p className="mt-4 leading-7 text-stone-600">Masuk untuk mengelola kebutuhan rumah dan menu keluarga.</p>
        <LoginForm />
      </section>
    </AppShell>
  );
}
