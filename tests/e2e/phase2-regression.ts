/**
 * Phase 2 browser regression (desktop + mobile).
 *
 *   E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e
 *
 * Needs the app running (E2E_BASE_URL, default http://localhost:3000) against
 * the LOCAL Supabase stack, and an owner/admin login. It creates its own
 * prefixed test records (orders 9912…, printer TEST-E2E-*, failure 9912…) and
 * deletes only those. It refuses to run against a non-local app or database.
 */
import "../helpers/env";
import { createRequire } from "node:module";
import { cleanupTestOrders, db } from "../helpers/db";
import { createTestPrinter, deleteTestPrinters, ingestEtsy, jobsFor, orderBy, receiptWithItems, rpc, unitsFor } from "../helpers/fixtures";

type Page = {
  goto(url: string, o?: object): Promise<{ status(): number } | null>;
  fill(sel: string, v: string): Promise<void>;
  click(sel: string): Promise<void>;
  waitForURL(re: RegExp, o?: object): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  getByRole(role: string, o: object): Locator;
  getByText(t: string | RegExp, o?: object): Locator;
  getByLabel(t: string | RegExp, o?: object): Locator;
  locator(sel: string): Locator;
  on(ev: string, fn: (x: { type?(): string; text?(): string; message?: string }) => void): void;
};
type Locator = {
  click(): Promise<void>;
  fill(v: string): Promise<void>;
  check(): Promise<void>;
  first(): Locator;
  last(): Locator;
  nth(i: number): Locator;
  count(): Promise<number>;
  waitFor(o?: object): Promise<void>;
  locator(sel: string): Locator;
  filter(o: object): Locator;
  getByRole(role: string, o: object): Locator;
  getByText(t: string | RegExp, o?: object): Locator;
  isVisible(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  selectOption(o: { index: number }): Promise<unknown>;
};
// Playwright is installed globally in this environment; resolve via require.
const { chromium, devices } = createRequire(import.meta.url)("playwright") as {
  chromium: { launch(): Promise<{ newContext(o: object): Promise<{ newPage(): Promise<Page> }>; close(): Promise<void> }> };
  devices: Record<string, object>;
};

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error(`Refusing to run browser tests against ${BASE}`);
if (!EMAIL || !PASSWORD) throw new Error("Set E2E_EMAIL and E2E_PASSWORD (an owner/admin on the local stack).");

const PREFIX = "9912";
const PRINTER = "TEST-E2E-P2";
const T0 = Math.floor(Date.now() / 1000) - 3600;
const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const PAGES = [
  "/overview", "/orders", "/orders?view=review", "/production", "/printers", "/fulfilment",
  "/products", "/filament", "/customers", "/analytics", "/settings", "/settings/integrations",
];

async function cleanup() {
  await db.from("printers").update({ status: "available", current_job_id: null, current_print_run_id: null }).like("name", `${PRINTER}%`);
  await cleanupTestOrders(PREFIX);
  await deleteTestPrinters(PRINTER);
}

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", EMAIL!);
  await page.fill("#password", PASSWORD!);
  await page.click("button[type=submit]");
  await page.waitForURL(/overview/, { timeout: 60_000 });
}

/** Load every page; check status, runtime errors and horizontal overflow. */
async function sweep(page: Page, label: string, errors: string[]) {
  for (const path of PAGES) {
    errors.length = 0;
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const { sw, vw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
    const ok = (res?.status() ?? 0) < 400 && sw <= vw + 1 && errors.length === 0;
    check(`${label} ${path}`, ok, ok ? undefined : `status=${res?.status()} scroll=${sw}/${vw} errors=${errors.slice(0, 2).join(" | ")}`);
  }
}

async function main() {
  await cleanup();
  const printerId = await createTestPrinter(PRINTER);

  // Order A: personalisation changed after printing → needs a decision.
  const A = `${PREFIX}0001`;
  await ingestEtsy(receiptWithItems(A, T0, [{ tx: `${A}01`, qty: 1, personalisation: "Name: Ada" }]));
  const jobA = (await jobsFor(A))[0]!;
  const runA = await rpc<string>("start_print_run", { p_job_id: jobA.id, p_printer_id: printerId });
  await rpc("finish_print_run", { p_run_id: runA, p_succeeded: true });
  await ingestEtsy(receiptWithItems(A, T0 + 60, [{ tx: `${A}01`, qty: 1, personalisation: "Name: Grace" }]));

  // Order B: 3 units, 3 on the printer — to record a partial result in the UI.
  const B = `${PREFIX}0002`;
  await ingestEtsy(receiptWithItems(B, T0, [{ tx: `${B}01`, qty: 3, title: "E2E Plate Item" }]));
  const jobB = (await jobsFor(B))[0]!;
  await rpc("start_print_run", { p_job_id: jobB.id, p_printer_id: printerId, p_quantity: 3 });

  // A failed import with no stored payload (can't be retried, can be dismissed).
  const F = `${PREFIX}0099`;
  await rpc("record_sync_failure", {
    p_provider: "etsy", p_external_order_id: F, p_marketplace_updated_at: new Date().toISOString(),
    p_payload: {}, p_error: "E2E injected failure", p_sync_log_id: null,
  });

  const browser = await chromium.launch();
  try {
    // ---------- Desktop ----------
    const desk = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const errors: string[] = [];
    desk.on("console", (m) => m.type?.() === "error" && errors.push(m.text?.() ?? ""));
    desk.on("pageerror", (e) => errors.push(e.message ?? String(e)));
    await login(desk);
    await sweep(desk, "desktop", errors);

    // Orders list: Needs review tab + badge.
    await desk.goto(`${BASE}/orders?view=review`, { waitUntil: "networkidle" });
    check("review tab lists the changed order", (await desk.getByText(A).count()) > 0);

    // Order detail: resolve the personalisation change by requesting a reprint.
    const orderA = await orderBy(A);
    await desk.goto(`${BASE}/orders/${orderA.id}`, { waitUntil: "networkidle" });
    check("order shows the decision", await desk.getByText("Decision needed").first().isVisible());
    await desk.getByRole("button", { name: "Reprint affected units" }).click();
    await desk.locator("#review-note").fill("E2E: reprint with new name");
    await desk.getByRole("button", { name: "Confirm" }).click();
    await desk.waitForTimeout(2500);
    const unitsA = await unitsFor(jobA.id);
    const orderAfter = await orderBy(A);
    check("reprint decision applied (unit back to pending, review cleared)", unitsA[0]?.status === "pending" && !orderAfter.requires_review,
      `unit=${unitsA[0]?.status} requires_review=${orderAfter.requires_review}`);

    // Print farm: record a partial plate (unit 2 failed).
    await desk.goto(`${BASE}/printers`, { waitUntil: "networkidle" });
    const card = desk.locator("div").filter({ hasText: PRINTER }).filter({ has: desk.getByRole("button", { name: "Failed" }) }).last();
    await card.getByRole("button", { name: "Failed" }).click();
    await desk.getByRole("button", { name: "Some failed" }).click();
    await desk.getByText("Unit 2", { exact: false }).first().click();
    await desk.locator("#failure-reason").selectOption({ index: 1 });
    await desk.getByRole("button", { name: "Record partial result" }).click();
    await desk.waitForTimeout(2500);
    const unitsB = (await unitsFor(jobB.id)).map((u) => u.status);
    check("partial plate recorded (2 printed, 1 back to pending)", unitsB.join(",") === "printed,pending,printed", unitsB.join(","));

    // Production board: progress bar + units in the job sheet.
    await desk.goto(`${BASE}/production`, { waitUntil: "networkidle" });
    check("job card shows 2/3 printed", (await desk.getByText("2/3 printed").count()) > 0);
    await desk.getByRole("button", { name: `Open ${jobB.job_number}` }).first().click();
    await desk.waitForTimeout(1200);
    check("job sheet lists units", (await desk.getByText("Unit 3").count()) > 0 && (await desk.getByRole("button", { name: "Record QC failure" }).count()) > 0);

    // Failed orders: tabs, dismiss (reason required), reopen, retry message.
    await desk.goto(`${BASE}/settings/integrations`, { waitUntil: "networkidle" });
    const row = desk.locator("[data-testid=sync-failure]").filter({ hasText: F });
    check("failed order listed with next-retry info", (await row.count()) === 1 && (await row.getByText("Next retry").count()) === 1);
    await row.getByRole("button", { name: "Retry now" }).click();
    await desk.waitForTimeout(2000);
    check("retry without stored data explains itself", (await desk.getByText(/No stored order data/).count()) > 0);
    await row.getByRole("button", { name: "Dismiss…" }).click();
    const dismiss = desk.getByRole("dialog", {}).getByRole("button", { name: "Dismiss" });
    // The confirm button stays disabled until a reason is given.
    check("dismiss requires a reason", !(await dismiss.isEnabled()));
    await desk.locator("#failure-note").fill("E2E test order");
    await dismiss.click();
    await desk.waitForTimeout(2000);
    const dismissed = (await db.from("sync_failures").select("dismissed_at, dismiss_reason").eq("external_order_id", F).single()).data!;
    check("dismissed with reason", Boolean(dismissed.dismissed_at) && dismissed.dismiss_reason === "E2E test order");
    await desk.getByRole("tab", { name: /Dismissed/ }).click();
    await desk.locator("[data-testid=sync-failure]").filter({ hasText: F }).getByRole("button", { name: "Reopen" }).click();
    await desk.getByRole("dialog", {}).getByRole("button", { name: "Reopen" }).click();
    await desk.waitForTimeout(2000);
    const reopened = (await db.from("sync_failures").select("dismissed_at").eq("external_order_id", F).single()).data!;
    check("reopened", reopened.dismissed_at === null);
    const events = (await db.from("sync_failure_events").select("event").eq("failure_id", (await db.from("sync_failures").select("id").eq("external_order_id", F).single()).data!.id).order("created_at")).data!.map((e) => e.event);
    check("failure history recorded", events.join(",") === "failed,retried,dismissed,reopened" || events.join(",") === "failed,dismissed,reopened", events.join(","));
    check("no runtime errors during desktop flows", errors.length === 0, errors.slice(0, 3).join(" | "));

    // ---------- Mobile ----------
    const mob = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();
    const mErrors: string[] = [];
    mob.on("console", (m) => m.type?.() === "error" && mErrors.push(m.text?.() ?? ""));
    mob.on("pageerror", (e) => mErrors.push(e.message ?? String(e)));
    await login(mob);
    await sweep(mob, "mobile", mErrors);
    for (const path of [`/orders/${orderA.id}`, "/settings/integrations"]) {
      await mob.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      const { sw, vw } = await mob.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
      check(`mobile ${path} fits`, sw <= vw + 1, `${sw}/${vw}`);
    }
  } finally {
    await browser.close();
    await cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup();
  process.exit(1);
});
