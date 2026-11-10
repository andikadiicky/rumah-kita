import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return <AppShell authenticated>{children}</AppShell>;
}
