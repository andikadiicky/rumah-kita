import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { chromium, expect } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { addCalendarDays, mondayForDate } from "../src/lib/meal-plan/model";
import { todayInJakarta } from "../src/lib/date";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

test("household UI: essentials, recipes, meal planning, calendar navigation, dashboard, accessibility, and auth", { timeout: 240_000 }, async () => {
  const db = new PGlite();
  const directory = await mkdtemp(join(tmpdir(), "rumah-kita-browser-"));
  let child: ReturnType<typeof spawn> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: owner, role: "authenticated", aud: "authenticated", exp: expires })).toString("base64url"),
    "local-test-signature",
  ].join(".");
  const user = { id: owner, aud: "authenticated", role: "authenticated", email: "owner@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  let rejectWrite = false;
  let ownerScopedLoads = 0;
  const writes: Record<string, unknown>[] = [];
  const mealRanges: string[][] = [];

  // Test-only Auth/PostgREST fixture. Real application Auth and write API are unchanged.
  const fixture = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    const send = (status: number, data: unknown) => { response.writeHead(status); response.end(JSON.stringify(data)); };
    try {
      if (request.headers.authorization !== `Bearer ${token}`) return send(401, { message: "Unauthorized fixture" });
      const url = new URL(request.url!, "http://fixture.test");
      if (url.pathname === "/auth/v1/user") return send(200, user);
      if (!["/rest/v1/essentials", "/rest/v1/recipes", "/rest/v1/meal_slots"].includes(url.pathname)) return send(404, {});
      const recipeRequest = url.pathname === "/rest/v1/recipes";
      const mealRequest = url.pathname === "/rest/v1/meal_slots";
      if (request.method === "GET") {
        assert.equal(url.searchParams.get("owner_id"), `eq.${owner}`);
        ownerScopedLoads++;
        if (mealRequest) {
          const bounds = url.searchParams.getAll("meal_date");
          assert.equal(bounds.length, 2);
          const lower = bounds.find((bound) => bound.startsWith("gte."))?.slice(4);
          const upper = bounds.find((bound) => bound.startsWith("lt."))?.slice(3);
          assert.ok(lower && upper);
          mealRanges.push([lower, upper]);
          const result = await db.query(`select id,meal_date::text,meal_type,recipe_id,meal_name
            from public.meal_slots where owner_id=$1 and meal_date >= $2 and meal_date < $3 order by meal_date,meal_type`, [owner, lower, upper]);
          return send(200, result.rows);
        }
        if (recipeRequest) {
          const result = await db.query("select id,name,servings,ingredients,steps from public.recipes order by created_at desc,id");
          return send(200, result.rows);
        }
        const conditions: string[] = [];
        const values: string[] = [];
        const status = url.searchParams.get("status");
        if (status === "eq.out_of_stock") conditions.push("status='out_of_stock'");
        if (status === "in.(to_buy,out_of_stock)") conditions.push("status in ('to_buy','out_of_stock')");
        for (const bound of url.searchParams.getAll("planned_purchase_date")) {
          const operator = bound.startsWith("gte.") ? ">=" : "<";
          values.push(bound.slice(bound.indexOf(".") + 1));
          conditions.push(`planned_purchase_date ${operator} $${values.length}`);
        }
        const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
        const ordered = status ? "planned_purchase_date nulls last,name,id" : "created_at desc,id";
        const result = await db.query(`select id,name,status,planned_purchase_date::text from public.essentials ${where} order by ${ordered}`, values);
        const limit = Number(url.searchParams.get("limit") ?? result.rows.length);
        const rows = result.rows.slice(0, limit);
        if (request.headers.prefer?.includes("count=exact")) response.setHeader("Content-Range", `0-${Math.max(0, rows.length - 1)}/${result.rows.length}`);
        return send(200, rows);
      }
      if (rejectWrite) { rejectWrite = false; return send(503, { message: "Private DB error must never reach the UI" }); }
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      writes.push({ method: request.method, ...body });
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      let result;
      if (mealRequest) {
        if (request.method === "POST") {
          assert.equal(body.owner_id, owner);
          assert.equal(url.searchParams.get("on_conflict"), "owner_id,meal_date,meal_type");
          result = await db.query(`insert into public.meal_slots(owner_id,meal_date,meal_type,recipe_id,meal_name)
            values ($1,$2,$3,$4,$5) on conflict(owner_id,meal_date,meal_type)
            do update set recipe_id=excluded.recipe_id, meal_name=excluded.meal_name
            returning id,meal_date::text,meal_type,recipe_id,meal_name`,
          [owner, body.meal_date, body.meal_type, body.recipe_id, body.meal_name]);
        } else if (request.method === "DELETE") {
          assert.equal(url.searchParams.get("owner_id"), `eq.${owner}`);
          result = await db.query(`delete from public.meal_slots where owner_id=$1 and meal_date=$2 and meal_type=$3 returning id`,
          [owner, url.searchParams.get("meal_date")?.slice(3), url.searchParams.get("meal_type")?.slice(3)]);
        } else return send(405, {});
      } else if (recipeRequest) {
        if (request.method === "POST") {
          assert.equal(body.owner_id, owner);
          result = await db.query(`insert into public.recipes(owner_id,name,servings,ingredients,steps)
            values ($1,$2,$3,$4,$5) returning id,name,servings,ingredients,steps`,
          [owner, body.name, body.servings, body.ingredients, body.steps]);
        } else {
          assert.equal(url.searchParams.get("owner_id"), `eq.${owner}`);
          if (request.method === "PATCH") result = await db.query(`update public.recipes
            set name=$1,servings=$2,ingredients=$3,steps=$4 where owner_id=$5 and id=$6
            returning id,name,servings,ingredients,steps`,
          [body.name, body.servings, body.ingredients, body.steps, owner, id]);
          else if (request.method === "DELETE") result = await db.query("delete from public.recipes where owner_id=$1 and id=$2 returning id", [owner, id]);
          else return send(405, {});
        }
      } else if (request.method === "POST") {
        assert.equal(body.owner_id, owner);
        result = await db.query(`insert into public.essentials(owner_id,name,status,planned_purchase_date)
          values ($1,$2,$3,$4) returning id,name,status,planned_purchase_date::text`,
        [body.owner_id, body.name, body.status, body.planned_purchase_date]);
      } else {
        assert.equal(url.searchParams.get("owner_id"), `eq.${owner}`);
        if (request.method === "PATCH") {
          result = await db.query(`update public.essentials set name=$1,status=$2,planned_purchase_date=$3
            where owner_id=$4 and id=$5 returning id,name,status,planned_purchase_date::text`,
          [body.name, body.status, body.planned_purchase_date, owner, id]);
        } else if (request.method === "DELETE") {
          result = await db.query("delete from public.essentials where owner_id=$1 and id=$2 returning id", [owner, id]);
        } else return send(405, {});
      }
      return send(200, request.headers.accept?.includes("vnd.pgrst.object") ? result.rows[0] : result.rows);
    } catch {
      send(500, { message: "Fixture operation failed" });
    }
  });

  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated;
      grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('${owner}'),('${other}');`);
    for (const file of ["001_initial.sql", "002_household_backend.sql"]) {
      await db.exec(await readFile(join(process.cwd(), "supabase/migrations", file), "utf8"));
    }
    await db.exec(`insert into public.essentials(owner_id,name,status) values
      ('${other}','Barang rahasia akun lain','to_buy');
      insert into public.recipes(owner_id,name,servings,ingredients,steps) values
      ('${other}','Resep rahasia akun lain',1,array['Rahasia'],array['Rahasia']);
      set role authenticated; set request.jwt.claim.sub='${owner}';`);
    fixture.listen(0, "127.0.0.1");
    await once(fixture, "listening");
    const address = fixture.address();
    assert.ok(address && typeof address === "object");
    const fixtureUrl = `http://127.0.0.1:${address.port}`;

    // Separate directory/output keeps the user's running dev server and real env untouched.
    for (const file of ["src", "package.json", "package-lock.json", "tsconfig.json", "postcss.config.mjs", "next.config.ts"]) {
      await cp(join(process.cwd(), file), join(directory, file), { recursive: true });
    }
    await symlink(join(process.cwd(), "node_modules"), join(directory, "node_modules"), "dir");
    const portProbe = createServer();
    portProbe.listen(0, "127.0.0.1");
    await once(portProbe, "listening");
    const probeAddress = portProbe.address();
    assert.ok(probeAddress && typeof probeAddress === "object");
    const port = probeAddress.port;
    await new Promise<void>((resolve) => portProbe.close(() => resolve()));
    const base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [join(process.cwd(), "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: directory,
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: fixtureUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_test", NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let logs = "";
    child.stdout?.on("data", (data) => { logs += String(data); });
    child.stderr?.on("data", (data) => { logs += String(data); });
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 45_000;
      const timer = setInterval(() => {
        if (logs.includes("Ready in")) { clearInterval(timer); resolve(); }
        else if (child?.exitCode != null || Date.now() > deadline) { clearInterval(timer); reject(new Error(logs)); }
      }, 100);
    });
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : chromium.executablePath()), args: ["--no-sandbox"] });
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    for (const path of ["/", "/essentials", "/recipes", "/meal-plan"]) {
      await guestPage.goto(base + path);
      await expect(guestPage).toHaveURL(base + "/login");
      await expect(guestPage.getByLabel("Email", { exact: true })).toBeVisible();
      await expect(guestPage.getByLabel("Kata sandi", { exact: true })).toBeVisible();
    }
    const unauthorized = await guest.request.post(base + "/api/household", {
      headers: { Origin: base }, data: { entity: "essential", action: "save", data: { name: "Guest", status: "to_buy" } },
    });
    assert.equal(unauthorized.status(), 401);
    assert.deepEqual(await unauthorized.json(), { error: "Silakan masuk terlebih dahulu." });
    const wrongOrigin = await guest.request.post(base + "/auth/logout", {
      headers: { Origin: "https://untrusted.example" }, maxRedirects: 0,
    });
    assert.equal(wrongOrigin.status(), 403);
    const forwardedLogout = await guest.request.post(base + "/auth/logout", {
      headers: { Origin: "https://rumah-kita.example", Host: "rumah-kita.example", "X-Forwarded-Proto": "https" },
      maxRedirects: 0,
    });
    assert.equal(forwardedLogout.status(), 303);
    assert.equal(forwardedLogout.headers().location, "https://rumah-kita.example/login");
    await guest.close();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([{
      name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify({ access_token: token, refresh_token: "test-refresh", expires_at: expires, expires_in: 3600, token_type: "bearer", user })).toString("base64url"),
      url: base, sameSite: "Lax",
    }]);
    const page = await context.newPage();
    page.on("pageerror", (error) => console.error("Browser runtime error:", error.message));
    page.setDefaultTimeout(20_000);
    await page.goto(base + "/essentials");
    await expect(page.getByText("Belum ada kebutuhan rumah", { exact: true })).toBeVisible();
    await expect(page.getByText("Barang rahasia akun lain")).toHaveCount(0);
    const add = page.getByRole("region", { name: "Tambah kebutuhan", exact: true });
    await add.getByLabel("Nama barang").fill("Beras uji");
    await add.getByLabel("Rencana beli").fill("2020-01-02");
    let releaseWrite!: () => void;
    const heldWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
    await page.route("**/api/household", async (route) => { await heldWrite; await route.continue(); }, { times: 1 });
    await add.getByRole("button", { name: "Tambah barang", exact: true }).click();
    await expect(add.getByLabel("Nama barang")).toBeDisabled();
    await expect(add.getByRole("button", { name: "Menyimpan…", exact: true })).toBeDisabled();
    releaseWrite();
    let card = page.getByRole("listitem", { name: "Beras uji", exact: true });
    await expect(card).toBeVisible();
    await expect(card.getByText("Terlambat", { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: "/tmp/rumah-kita-essentials-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 768, height: 1024 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: "/tmp/rumah-kita-essentials-tablet.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    card = page.getByRole("listitem", { name: "Beras uji", exact: true });
    await expect(card.locator("time")).toHaveAttribute("datetime", "2020-01-02");
    await expect(card).toBeVisible();
    assert.ok(ownerScopedLoads >= 2, "reload must query owner-scoped data on the server");

    // Failed edits retain typed input and the previous persisted value.
    await card.getByRole("button", { name: "Ubah", exact: true }).click();
    await card.getByLabel("Nama barang").fill("Beras merah");
    await card.getByLabel("Rencana beli").fill("2020-02-03");
    await card.getByLabel("Status", { exact: true }).selectOption("out_of_stock");
    rejectWrite = true;
    await card.getByRole("button", { name: "Simpan perubahan", exact: true }).click();
    await expect(card.getByRole("alert")).toContainText("Perubahan ditolak");
    await expect(card.getByLabel("Nama barang")).toHaveValue("Beras merah");
    await expect(card.getByLabel("Rencana beli")).toHaveValue("2020-02-03");
    await expect(page.getByText("Private DB error must never reach the UI")).toHaveCount(0);
    await card.getByRole("button", { name: "Simpan perubahan", exact: true }).click();
    card = page.getByRole("listitem", { name: "Beras merah", exact: true });
    await expect(card).toBeVisible();
    await page.getByRole("button", { name: /^Habis \(/ }).click();
    await expect(card).toBeVisible();
    await page.getByRole("button", { name: /^Perlu Dibeli \(/ }).click();
    await expect(card).toBeVisible();
    const before = writes.length;
    await card.getByRole("button", { name: "Sudah Dibeli", exact: true }).click();
    await expect(page.getByText("Tidak ada barang yang perlu dibeli", { exact: true })).toBeVisible();
    assert.equal(writes.length, before + 1);
    assert.equal(writes.at(-1)?.status, "in_stock");
    assert.equal(writes.at(-1)?.planned_purchase_date, null);
    await page.getByRole("button", { name: /^Semua \(/ }).click();
    await expect(card.getByText("Tersedia", { exact: true })).toBeVisible();
    await expect(card.getByText("Terlambat", { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(card).toContainText("Belum dijadwalkan");

    await page.setViewportSize({ width: 1024, height: 768 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await card.getByRole("button", { name: "Hapus", exact: true }).click();
    await card.getByRole("button", { name: "Batal", exact: true }).click();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Hapus", exact: true }).click();
    await card.getByRole("button", { name: "Ya, hapus", exact: true }).click();
    await expect(page.getByText("Belum ada kebutuhan rumah", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Belum ada kebutuhan rumah", { exact: true })).toBeVisible();

    // Recipe CRUD uses the same real write route and PostgreSQL persistence.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/recipes");
    await expect(page.getByText("Belum ada resep keluarga", { exact: true })).toBeVisible();
    await expect(page.getByText("Resep rahasia akun lain")).toHaveCount(0);
    await page.getByRole("button", { name: "Tambah resep", exact: true }).click();
    const editor = page.getByRole("region", { name: "Resep baru", exact: true });
    const ingredients = "2 piring nasi\n2 butir telur\n\nBumbu:\nGaram secukupnya";
    const steps = "Panaskan minyak.\nMasukkan telur.\n\nTambahkan nasi, lalu aduk.";
    await editor.getByLabel("Nama resep").fill("Nasi goreng uji");
    await editor.getByLabel("Porsi", { exact: true }).fill("3");
    await editor.getByLabel("Bahan-bahan", { exact: true }).fill(ingredients);
    await editor.getByLabel("Langkah memasak", { exact: true }).fill(steps);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: "/tmp/rumah-kita-recipes-editor-mobile.png", fullPage: true });
    await editor.getByRole("button", { name: "Simpan resep", exact: true }).click();
    let recipe = page.getByRole("article", { name: "Nasi goreng uji", exact: true });
    await expect(recipe).toBeVisible();
    await page.reload();
    await expect(recipe).toBeVisible();
    await recipe.locator("summary").click();
    await expect(recipe.getByText("3 porsi", { exact: true })).toBeVisible();
    const ingredientDetail = recipe.getByRole("region", { name: "Bahan-bahan", exact: true }).locator("p");
    assert.equal(await ingredientDetail.textContent(), ingredients);
    assert.equal(await ingredientDetail.evaluate((el) => getComputedStyle(el).whiteSpace), "pre-wrap");
    assert.equal(await recipe.getByRole("region", { name: "Langkah memasak", exact: true }).locator("p").textContent(), steps);
    await page.screenshot({ path: "/tmp/rumah-kita-recipes-detail-mobile.png", fullPage: true });
    const storedRecipe = await db.query<{id: string}>("select id from public.recipes where name='Nasi goreng uji'");
    await db.query(`insert into public.meal_slots(owner_id,meal_date,meal_type,recipe_id,meal_name)
      values ($1,'2026-11-09','dinner',$2,'')`, [owner, storedRecipe.rows[0].id]);
    await recipe.getByRole("button", { name: "Ubah", exact: true }).click();
    await recipe.getByLabel("Nama resep").fill("Nasi goreng revisi");
    await recipe.getByLabel("Porsi", { exact: true }).fill("4");
    const editedSteps = steps + "\nSajikan selagi hangat.";
    await recipe.getByLabel("Langkah memasak", { exact: true }).fill(editedSteps);
    rejectWrite = true;
    await recipe.getByRole("button", { name: "Simpan perubahan", exact: true }).click();
    await expect(recipe.getByRole("alert")).toContainText("Perubahan ditolak");
    await expect(recipe.getByLabel("Nama resep")).toHaveValue("Nasi goreng revisi");
    await expect(recipe.getByLabel("Langkah memasak", { exact: true })).toHaveValue(editedSteps);
    await expect(recipe.getByLabel("Bahan-bahan", { exact: true })).toHaveValue(ingredients);
    await page.setViewportSize({ width: 768, height: 1024 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: "/tmp/rumah-kita-recipes-editor-tablet.png", fullPage: true });
    await recipe.getByRole("button", { name: "Simpan perubahan", exact: true }).click();
    recipe = page.getByRole("article", { name: "Nasi goreng revisi", exact: true });
    await expect(recipe).toBeVisible();
    await page.reload();
    await recipe.locator("summary").click();
    await expect(recipe.getByText("4 porsi", { exact: true })).toBeVisible();
    assert.equal(await recipe.getByRole("region", { name: "Langkah memasak", exact: true }).locator("p").textContent(), editedSteps);
    await recipe.getByRole("button", { name: "Hapus", exact: true }).click();
    await expect(recipe).toContainText("Jadwal makan yang memakai resep ini tetap tersimpan beserta nama resep");
    await recipe.getByRole("button", { name: "Batal", exact: true }).click();
    await expect(recipe).toBeVisible();
    await recipe.getByRole("button", { name: "Hapus", exact: true }).click();
    await recipe.getByRole("button", { name: "Ya, hapus resep", exact: true }).click();
    await expect(page.getByText("Belum ada resep keluarga", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Belum ada resep keluarga", { exact: true })).toBeVisible();
    const remainingMeal = await db.query<{recipe_id: string | null; meal_name: string}>("select recipe_id,meal_name from public.meal_slots");
    assert.deepEqual(remainingMeal.rows, [{ recipe_id: null, meal_name: "Nasi goreng uji" }]);

    // Selected week is canonical in the URL; only its half-open date range is fetched.
    const plannedRecipe = await db.query<{id: string}>(`insert into public.recipes(owner_id,name,servings,ingredients,steps)
      values ($1,'Sup uji',2,array['Air'],array['Rebus']) returning id`, [owner]);
    await db.query(`insert into public.meal_slots(owner_id,meal_date,meal_type,meal_name) values
      ($1,'2026-11-29','breakfast','Di luar sebelum'),($1,'2026-12-07','breakfast','Di luar sesudah')`, [owner]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/meal-plan?week=2026-12-02");
    await expect(page).toHaveURL(base + "/meal-plan?week=2026-11-30");
    await expect(page.getByText("Di luar sebelum", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Di luar sesudah", { exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Minggu berikutnya →", exact: true }).click();
    await expect(page).toHaveURL(base + "/meal-plan?week=2026-12-07");
    await expect(page.getByText("Di luar sesudah", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "← Minggu sebelumnya", exact: true }).click();
    await expect(page).toHaveURL(base + "/meal-plan?week=2026-11-30");
    assert.ok(mealRanges.some(([lower, upper]) => lower === "2026-11-30" && upper === "2026-12-07"));
    assert.ok(mealRanges.some(([lower, upper]) => lower === "2026-12-07" && upper === "2026-12-14"));
    const chooseTuesday = () => page.getByRole("button", { name: "Selasa, 1 Desember 2026", exact: true }).click();
    await chooseTuesday();
    await expect(page.getByRole("button", { name: "Selasa, 1 Desember 2026", exact: true })).toHaveAttribute("aria-pressed", "true");
    const tuesday = page.getByRole("region", { name: "Selasa, 1 Desember 2026", exact: true });
    const lunch = tuesday.getByRole("article", { name: "Makan Siang", exact: true });
    await expect(page.getByRole("article")).toHaveCount(3);
    await lunch.getByRole("button", { name: "Atur menu", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Jenis menu").selectOption("custom");
    await dialog.getByLabel("Nama menu").fill("Makan di luar");
    await dialog.getByRole("button", { name: "Simpan menu", exact: true }).click();
    await expect(lunch.getByText("Makan di luar", { exact: true })).toBeVisible();
    await page.reload();
    await chooseTuesday();
    await expect(lunch.getByText("Makan di luar", { exact: true })).toBeVisible();
    const originalSlot = await db.query<{id: string}>("select id from public.meal_slots where meal_date='2026-12-01' and meal_type='lunch'");
    await page.screenshot({ path: "/tmp/rumah-kita-meal-plan-mobile.png", fullPage: true });
    await lunch.getByRole("button", { name: "Ganti / kosongkan", exact: true }).click();
    await dialog.getByLabel("Jenis menu").selectOption("recipe");
    await dialog.getByLabel("Resep", { exact: true }).selectOption(plannedRecipe.rows[0].id);
    rejectWrite = true;
    await dialog.getByRole("button", { name: "Simpan menu", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Menu belum dapat disimpan");
    await expect(dialog.getByLabel("Resep", { exact: true })).toHaveValue(plannedRecipe.rows[0].id);
    await dialog.getByRole("button", { name: "Simpan menu", exact: true }).click();
    await expect(lunch.getByText("Sup uji", { exact: true })).toBeVisible();
    const replaced = await db.query<{id: string; recipe_id: string}>("select id,recipe_id from public.meal_slots where meal_date='2026-12-01' and meal_type='lunch'");
    assert.equal(replaced.rows.length, 1);
    assert.equal(replaced.rows[0].id, originalSlot.rows[0].id);
    assert.equal(replaced.rows[0].recipe_id, plannedRecipe.rows[0].id);
    await db.query("update public.recipes set name='Sup terbaru' where id=$1", [plannedRecipe.rows[0].id]);
    await page.reload();
    await chooseTuesday();
    await expect(lunch.getByText("Sup terbaru", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 768, height: 1024 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: "/tmp/rumah-kita-meal-plan-tablet.png", fullPage: true });
    await page.goto(base + "/recipes");
    const soup = page.getByRole("article", { name: "Sup terbaru", exact: true });
    await soup.getByRole("button", { name: "Hapus", exact: true }).click();
    await soup.getByRole("button", { name: "Ya, hapus resep", exact: true }).click();
    await expect(soup).toHaveCount(0);
    await page.goto(base + "/meal-plan?week=2026-11-30");
    await chooseTuesday();
    await expect(lunch.getByText("Sup uji", { exact: true })).toBeVisible();
    const preserved = await db.query<{recipe_id: string | null; meal_name: string}>("select recipe_id,meal_name from public.meal_slots where meal_date='2026-12-01' and meal_type='lunch'");
    assert.deepEqual(preserved.rows, [{ recipe_id: null, meal_name: "Sup uji" }]);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.getByRole("article")).toHaveCount(21);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: "/tmp/rumah-kita-meal-plan-desktop.png", fullPage: true });
    await lunch.getByRole("button", { name: "Ganti / kosongkan", exact: true }).click();
    await expect(dialog.getByLabel("Nama menu")).toHaveValue("Sup uji");
    await dialog.getByRole("button", { name: "Kosongkan slot", exact: true }).click();
    await dialog.getByRole("button", { name: "Ya, kosongkan", exact: true }).click();
    await expect(lunch.getByText("Belum ada menu", { exact: true })).toBeVisible();
    await page.reload();
    await expect(lunch.getByText("Belum ada menu", { exact: true })).toBeVisible();
    assert.equal((await db.query("select id from public.meal_slots where meal_date='2026-12-01' and meal_type='lunch'")).rows.length, 0);

    // Disposable dashboard records use calendar dates relative to Jakarta today.
    const today = todayInJakarta();
    await db.query(`insert into public.essentials(owner_id,name,status,planned_purchase_date) values
      ($1,'Habis dashboard','out_of_stock',null),
      ($1,'Terlambat dashboard','to_buy',$2),
      ($1,'Hari ini dashboard','to_buy',$3),
      ($1,'Mendatang dashboard','out_of_stock',$4),
      ($1,'Tersedia jangan tampil','in_stock',$2)`, [owner, addCalendarDays(today, -1), today, addCalendarDays(today, 7)]);
    const dashboardRecipe = await db.query<{id: string}>(`insert into public.recipes(owner_id,name,servings,ingredients,steps)
      values ($1,'Sarapan awal',2,array['Roti'],array['Panggang']) returning id`, [owner]);
    await db.query(`insert into public.meal_slots(owner_id,meal_date,meal_type,recipe_id,meal_name) values
      ($1,$2,'breakfast',$3,''),($1,$2,'dinner',null,'Menu tersimpan')
      on conflict(owner_id,meal_date,meal_type) do update set recipe_id=excluded.recipe_id,meal_name=excluded.meal_name`, [owner, today, dashboardRecipe.rows[0].id]);
    await db.query("update public.recipes set name='Sarapan terbaru' where id=$1", [dashboardRecipe.rows[0].id]);

    async function auditControls() {
      const failures = await page.evaluate(() => {
        const failures: string[] = [];
        for (const element of document.querySelectorAll<HTMLElement>("a,button,input:not([type=hidden]),select,textarea,summary")) {
          const bounds = element.getBoundingClientRect();
          const css = getComputedStyle(element);
          if (!bounds.width || !bounds.height || css.visibility === "hidden" || ((css.clip !== "auto" || css.clipPath !== "none") && !element.matches(":focus"))) continue;
          const label = element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 70) || element.getAttribute("name") || element.tagName;
          if (bounds.width < 43 || bounds.height < 43) failures.push(`Small target ${label}: ${bounds.width} x ${bounds.height}`);
          if (element.matches("input,select,textarea")) {
            const field = element as HTMLInputElement;
            if (!field.labels?.length && !field.getAttribute("aria-label") && !field.getAttribute("aria-labelledby")) failures.push(`Unlabelled field ${label}`);
          }
        }
        if (document.documentElement.scrollWidth > innerWidth) failures.push(`Page overflow: ${document.documentElement.scrollWidth} > ${innerWidth}`);
        const dialog = document.querySelector("dialog[open]");
        if (dialog && dialog.scrollWidth > dialog.clientWidth + 1) failures.push("Dialog overflow");
        return failures;
      });
      assert.deepEqual(failures, []);
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const element = document.activeElement;
        if (!element || element === document.body) return false;
        const style = getComputedStyle(element);
        return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
      });
      assert.equal(focus, true, "Keyboard focus must have a visible outline");
    }

    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + "/");
      await expect(page.getByRole("heading", { name: "Selamat datang di rumah", exact: true })).toBeVisible();
      const empty = page.getByRole("region", { name: /^Habis/ });
      const overdue = page.getByRole("region", { name: /^Belanja terlambat/ });
      const upcoming = page.getByRole("region", { name: /^Belanja mendatang/ });
      const todayMeals = page.getByRole("region", { name: "Menu hari ini", exact: true });
      await expect(empty.getByText("Habis dashboard", { exact: true })).toBeVisible();
      await expect(overdue.getByText("Terlambat dashboard", { exact: true })).toBeVisible();
      await expect(upcoming.getByText("Hari ini dashboard", { exact: true })).toBeVisible();
      await expect(upcoming.getByText("Mendatang dashboard", { exact: true })).toBeVisible();
      await expect(todayMeals.getByText("Sarapan terbaru", { exact: true })).toBeVisible();
      await expect(todayMeals.getByText("Menu tersimpan", { exact: true })).toBeVisible();
      await expect(page.getByText("Tersedia jangan tampil", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Barang rahasia akun lain", { exact: true })).toHaveCount(0);
      await expect(todayMeals.getByRole("link")).toHaveAttribute("href", `/meal-plan?week=${mondayForDate(today)}`);
      await auditControls();
      await page.screenshot({ path: `/tmp/rumah-kita-dashboard-${width}.png`, fullPage: true });
      const nav = page.getByRole("navigation", { name: "Navigasi utama", exact: true });
      await expect(nav).toHaveCount(1);
      await expect(nav.getByRole("link", { name: "Beranda", exact: true })).toHaveAttribute("aria-current", "page");
      const navBounds = await nav.boundingBox();
      assert.ok(navBounds);
      if (width === 390) assert.ok(navBounds.y >= 800, "Phone navigation should be at the bottom");
      else assert.ok(navBounds.x < 208 && navBounds.width <= 208, "Wider navigation should be in the sidebar");
      await empty.getByRole("link", { name: "Lihat semua", exact: true }).click();
      await expect(page).toHaveURL(base + "/essentials?filter=out_of_stock");
      await expect(page.getByRole("button", { name: /^Habis \(/ })).toHaveAttribute("aria-pressed", "true");
      await auditControls();
      await nav.getByRole("link", { name: "Resep", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Resep keluarga", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Tambah resep", exact: true }).click();
      await expect(page.getByLabel("Nama resep", { exact: true })).toBeVisible();
      await auditControls();
      await page.getByRole("region", { name: "Resep baru", exact: true }).getByRole("button", { name: "Batal", exact: true }).click();
      await nav.getByRole("link", { name: "Rencana makan", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Rencana makan", exact: true })).toBeVisible();
      await auditControls();
      await page.getByRole("article").first().getByRole("button").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await auditControls();
      await page.getByRole("dialog").getByRole("button", { name: "Batal", exact: true }).click();
      await nav.getByRole("link", { name: "Beranda", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Selamat datang di rumah", exact: true })).toBeVisible();
      await upcoming.getByRole("link", { name: "Lihat semua", exact: true }).click();
      await expect(page).toHaveURL(base + "/essentials?filter=to_buy");
      await expect(page.getByRole("button", { name: /^Perlu Dibeli \(/ })).toHaveAttribute("aria-pressed", "true");
    }
  } finally {
    await browser?.close();
    if (child?.pid) {
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already stopped. */ }
    }
    await new Promise<void>((resolve) => fixture.close(() => resolve()));
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
