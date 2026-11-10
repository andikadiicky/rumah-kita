"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";

const credentials = z.object({ email: z.email().max(254), password: z.string().min(1).max(1024) });
export type LoginState = { error: string };

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const result = credentials.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: formData.get("password"),
  });
  if (!result.success) return { error: "Masukkan email dan kata sandi yang valid." };
  if (!hasSupabaseConfiguration()) return { error: "Layanan masuk belum dikonfigurasi." };
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword(result.data);
    if (error) return { error: "Tidak dapat masuk. Periksa email dan kata sandi Anda." };
  } catch {
    return { error: "Layanan masuk sementara tidak tersedia. Coba lagi nanti." };
  }
  redirect("/");
}
