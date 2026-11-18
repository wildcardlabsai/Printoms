import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database";
import { DB_URL, assertLocalDatabase } from "./env";

assertLocalDatabase();

export const db: SupabaseClient<Database> = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!,
  { auth: { persistSession: false } },
);

/** Run SQL with psql (local test database only) — used for fault injection. */
export function sql(statement: string): string {
  return execFileSync("psql", [DB_URL, "-v", "ON_ERROR_STOP=1", "-Atqc", statement], { encoding: "utf8" }).trim();
}

/**
 * Fault injection: any order whose external_order_id is listed in
 * _test_fault_ids fails to insert/update — simulating a transient database
 * error or bad data for that one order.
 */
export function installFaultInjection() {
  sql(`
    create table if not exists public._test_fault_ids (external_order_id text primary key);
    create or replace function public._test_fault() returns trigger language plpgsql as $f$
    begin
      if exists (select 1 from public._test_fault_ids where external_order_id = new.external_order_id) then
        raise exception 'Injected test failure for %', new.external_order_id;
      end if;
      return new;
    end $f$;
    drop trigger if exists _test_fault on public.orders;
    create trigger _test_fault before insert or update on public.orders for each row execute function public._test_fault();
  `);
}

export function setFault(ids: string[]) {
  sql(`delete from public._test_fault_ids;${ids.map((id) => ` insert into public._test_fault_ids values ('${id.replace(/'/g, "''")}');`).join("")}`);
}

export function removeFaultInjection() {
  sql(`drop trigger if exists _test_fault on public.orders; drop function if exists public._test_fault(); drop table if exists public._test_fault_ids;`);
}

type IntegrationRow = Database["public"]["Tables"]["integrations"]["Row"];
type CredentialRow = Database["public"]["Tables"]["integration_credentials"]["Row"];

/**
 * Snapshot integration + credential rows so a test can connect fake shops and
 * put everything back exactly as it was afterwards.
 */
export async function snapshotIntegrations() {
  const { data: integrations } = await db.from("integrations").select("*");
  const { data: credentials } = await db.from("integration_credentials").select("*");
  const startedAt = new Date().toISOString();
  return {
    startedAt,
    async restore() {
      for (const row of (integrations ?? []) as IntegrationRow[]) {
        const { id, ...rest } = row;
        await db.from("integrations").update(rest).eq("id", id);
      }
      await db.from("integration_credentials").delete().not("id", "in", `(${(credentials ?? []).map((c) => c.id).join(",") || "00000000-0000-0000-0000-000000000000"})`);
      for (const row of (credentials ?? []) as CredentialRow[]) await db.from("integration_credentials").upsert(row);
      // Only rows created by this test run.
      await db.from("sync_logs").delete().gte("started_at", startedAt);
      await db.from("activity_log").delete().eq("entity_type", "integration").gte("created_at", startedAt);
    },
  };
}

/** Remove only test-created marketplace orders/customers/failures (prefix based). */
export async function cleanupTestOrders(externalPrefix: string) {
  // Customers created for these test orders (e.g. the "Shopify customer"
  // placeholder used when an order has no customer data). Removed below only
  // if, once the test orders are gone, they have no other orders.
  const { data: testOrders } = await db.from("orders").select("customer_id").like("external_order_id", `${externalPrefix}%`);
  const customerIds = [...new Set((testOrders ?? []).map((o) => o.customer_id).filter((id): id is string => Boolean(id)))];
  await db.from("orders").delete().like("external_order_id", `${externalPrefix}%`);
  for (const id of customerIds) {
    const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("customer_id", id);
    if (count === 0) await db.from("customers").delete().eq("id", id);
  }
  await db.from("sync_failures").delete().like("external_order_id", `${externalPrefix}%`);
  await db.from("customers").delete().like("display_name", "Test Buyer %");
  await db.from("customers").delete().like("display_name", "Shop Buyer %");
}
