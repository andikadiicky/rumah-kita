import { isSameOrigin } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || !isSameOrigin(request)) {
    return NextResponse.json({ error: "Permintaan tidak diizinkan." }, { status: 403 });
  }
  try {
    if (hasSupabaseConfiguration()) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) return NextResponse.json({ error: "Tidak dapat keluar. Silakan coba lagi." }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ error: "Layanan sementara tidak tersedia." }, { status: 503 });
  }
  // request.url may contain an internal host behind a deployment proxy.
  // Use the browser origin only after the same-origin check above succeeds.
  return NextResponse.redirect(new URL("/login", origin), 303);
}
