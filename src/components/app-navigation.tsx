"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Beranda", short: "Beranda", path: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" },
  { href: "/essentials", label: "Kebutuhan rumah", short: "Kebutuhan", path: "M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1" },
  { href: "/meal-plan", label: "Rencana makan", short: "Menu", path: "M8 2v4m8-4v4M3 10h18M4 4h16a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" },
  { href: "/recipes", label: "Resep", short: "Resep", path: "M12 5v16M3 3h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v16h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z" },
] as const;

export function AppNavigation() {
  const pathname = usePathname();
  function items(mobile: boolean) {
    return links.map((link) => {
      const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
      return <Link key={link.href} href={link.href} aria-label={link.label} aria-current={active ? "page" : undefined}
        className={`${mobile ? "flex min-h-16 min-w-0 flex-col justify-center gap-1 px-1 text-xs" : "flex min-h-12 gap-3 rounded-lg px-3 py-3 text-sm"} items-center font-medium ${active ? "bg-emerald-50 text-emerald-950" : "text-stone-600 hover:bg-stone-100"}`}>
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0"><path d={link.path} /></svg>
        <span className="min-w-0 break-words">{mobile ? link.short : link.label}</span>
      </Link>;
    });
  }
  return <>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-52 border-r border-stone-200 bg-white px-4 py-6 md:block">
      <Link href="/" className="mb-8 flex min-h-11 items-center rounded px-3 text-xl font-semibold tracking-tight">Rumah Kita<span className="text-amber-700">.</span></Link>
      <nav aria-label="Navigasi utama" className="space-y-2">{items(false)}</nav>
      <p className="mt-8 px-3 text-xs leading-6 text-stone-500">Satu rumah, satu ruang pribadi.</p>
    </aside>
    <nav aria-label="Navigasi utama" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">{items(true)}</nav>
  </>;
}
