import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "../../lib/supabase/server";

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return <>{children}</>;
}
