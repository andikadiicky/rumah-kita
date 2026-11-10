import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, hasSupabaseConfiguration } from "@/lib/supabase/server";
import { loadDashboard } from "@/lib/dashboard/load";
import { todayInJakarta } from "@/lib/date";
import { formatPurchaseDate, type Essential } from "@/lib/essentials/model";
import { calendarLabel, displayedMealName, mealLabels, mealTypes, mondayForDate, type MealSlot, type RecipeOption } from "@/lib/meal-plan/model";
import { DashboardRetry } from "@/components/dashboard-retry";

const sectionLink = "inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 py-2 text-sm font-medium text-emerald-900 underline underline-offset-4 hover:bg-emerald-50";

function SectionError() {
  return <div className="space-y-3 rounded-lg bg-red-50 p-4" role="alert"><p className="text-sm text-red-900">Bagian ini belum dapat dimuat. Periksa koneksi, lalu coba lagi.</p><DashboardRetry /></div>;
}

function Purchases({ id, title, description, result, href, emptyMessage, overdue = false }: {
  id: string; title: string; description: string;
  result: { data: Essential[] | null; error: unknown; count: number | null };
  href: string; emptyMessage: string; overdue?: boolean;
}) {
  const rows = result.data ?? [];
  return <section aria-labelledby={id} className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 id={id} className="text-xl font-semibold">{title}{!result.error && <span className="ml-2 text-base font-normal text-stone-500">({result.count ?? rows.length})</span>}</h2><Link href={href} className={sectionLink}>Lihat semua</Link></div>
    <p className="mt-2 mb-4 text-sm leading-6 text-stone-500">{description}</p>
    {result.error ? <SectionError /> : rows.length === 0 ? <p className="rounded-lg bg-stone-50 p-4 text-sm text-stone-600">{emptyMessage}</p> : <>
      <ul className="divide-y divide-stone-100">{rows.map((item) => <li key={item.id} className="flex min-h-16 flex-wrap items-center justify-between gap-2 py-3">
        <div className="min-w-0"><p className="font-medium break-words">{item.name}</p>{item.planned_purchase_date && <time className="mt-1 block text-sm text-stone-500" dateTime={item.planned_purchase_date}>{formatPurchaseDate(item.planned_purchase_date)}</time>}</div>
        {overdue && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-900">Terlambat</span>}
      </li>)}</ul>
      {result.count != null && result.count > rows.length && <p className="mt-3 text-sm text-stone-500">Menampilkan {rows.length} dari {result.count} barang. Buka daftar lengkap untuk melihat semuanya.</p>}
    </>}
  </section>;
}

export default async function HomePage() {
  if (!hasSupabaseConfiguration()) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  const today = todayInJakarta();
  const dashboard = await loadDashboard(supabase, user.id, today);
  const meals = (dashboard.meals.data ?? []) as MealSlot[];
  const recipes = (dashboard.recipes.data ?? []) as RecipeOption[];
  const mealHref = `/meal-plan?week=${mondayForDate(today)}`;
  return <div className="space-y-6">
    <div><p className="mb-3 text-sm font-medium uppercase tracking-widest text-amber-800">Beranda</p><h1 className="text-3xl font-semibold sm:text-4xl">Selamat datang di rumah</h1><p className="mt-3 text-stone-600"><time dateTime={today}>{calendarLabel(today, true)}</time> · Waktu Jakarta</p></div>
    <section aria-labelledby="today-meals" className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 id="today-meals" className="text-xl font-semibold">Menu hari ini</h2><Link href={mealHref} className={sectionLink}>Buka rencana makan</Link></div>
      {dashboard.meals.error || dashboard.recipes.error ? <SectionError /> : <div className="grid gap-3 @min-[580px]:grid-cols-3">{mealTypes.map((type) => {
        const slot = meals.find((item) => item.meal_type === type);
        return <article key={type} aria-label={mealLabels[type]} className="min-w-0 rounded-xl bg-stone-50 p-4"><h3 className="text-sm font-medium text-stone-500">{mealLabels[type]}</h3><p className="mt-2 font-semibold break-words">{slot ? displayedMealName(slot, recipes) : "Belum direncanakan"}</p></article>;
      })}</div>}
    </section>
    <div className="grid min-w-0 gap-6 @min-[820px]:grid-cols-2">
      <Purchases id="empty-items" title="Habis" description="Persediaan yang perlu diisi kembali." result={dashboard.empty} href="/essentials?filter=out_of_stock" emptyMessage="Tidak ada barang yang habis. Persediaan aman." />
      <Purchases id="available-items" title="Barang tersedia" description="Persediaan yang masih tersedia di rumah." result={dashboard.available} href="/essentials?filter=in_stock" emptyMessage="Belum ada barang dengan status tersedia." />
      <Purchases id="overdue-purchases" title="Belanja terlambat" description="Rencana sebelum hari ini yang masih perlu dibeli." result={dashboard.overdue} href="/essentials?filter=to_buy" emptyMessage="Tidak ada rencana belanja yang terlambat." overdue />
      <Purchases id="upcoming-purchases" title="Belanja mendatang" description="Rencana hari ini dan sesudahnya, diurutkan dari tanggal terdekat." result={dashboard.upcoming} href="/essentials?filter=to_buy" emptyMessage="Belum ada rencana belanja mendatang. Atur tanggal di Kebutuhan rumah." />
    </div>
  </div>;
}
