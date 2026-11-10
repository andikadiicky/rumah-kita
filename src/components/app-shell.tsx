import Link from "next/link";
import { AppNavigation } from "./app-navigation";

export function AppShell({ children, authenticated = false }: { children: React.ReactNode; authenticated?: boolean }) {
  return <div className={authenticated ? "min-h-screen pb-24 md:pb-0 md:pl-52" : "min-h-screen"}>
    <a href="#main-content" className="sr-only z-50 items-center rounded-lg bg-white font-medium focus:not-sr-only focus:min-h-11 focus:px-4 focus:py-3 focus:fixed focus:top-4 focus:left-4">Lewati ke konten</a>
    {authenticated && <AppNavigation />}
    <div className="mx-auto min-w-0 max-w-6xl px-5 sm:px-6 lg:px-8">
      <header className={`flex min-h-24 items-center justify-between gap-4 border-b border-stone-200 ${authenticated ? "md:justify-end" : ""}`}>
        <Link href="/" className={`flex min-h-11 items-center rounded text-2xl font-semibold tracking-tight ${authenticated ? "md:hidden" : ""}`}>Rumah Kita<span className="text-amber-700">.</span></Link>
        {authenticated && <form action="/auth/logout" method="post"><button className="min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100" type="submit">Keluar</button></form>}
      </header>
      <main id="main-content" tabIndex={-1} className="@container min-w-0 py-8 outline-none md:py-10">{children}</main>
      <footer className="border-t border-stone-200 py-6 text-sm text-stone-500">Ruang pribadi untuk rumah kita.</footer>
    </div>
  </div>;
}
