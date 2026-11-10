import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function hasSupabaseConfiguration() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");

  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        // Server Components cannot write cookies; proxy refreshes them first.
        // Route handlers and server actions can and must persist auth changes.
        for (const { name, value, options } of cookiesToSet) {
          try {
            cookieStore.set(name, value, options);
          } catch (error) {
            if (!(error instanceof Error) || !error.message.includes("Cookies can only be modified")) throw error;
          }
        }
      },
    },
  });
}

export async function getAuthenticatedUser() {
  if (!hasSupabaseConfiguration()) return null;
  const supabase = await createSupabaseServerClient();
  // getUser verifies with Supabase Auth. Never trust getSession alone on the server.
  const { data: { user }, error } = await supabase.auth.getUser();
  return error ? null : user;
}
