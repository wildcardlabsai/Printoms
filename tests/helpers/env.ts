/**
 * Integration tests write to the database. They refuse to run against
 * anything except a local Supabase stack unless explicitly overridden.
 */
export function assertLocalDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);
  if (!local && process.env.PRINTFLOW_ALLOW_REMOTE_TEST_DB !== "1") {
    throw new Error(`Refusing to run integration tests against ${url || "(unset)"} — point .env.local at a local Supabase stack.`);
  }
  if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SECRET_KEY is required for integration tests.");
  }
}

export const DB_URL = process.env.PRINTFLOW_TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Fake marketplace credentials — the marketplace APIs are mocked, never called.
process.env.ETSY_API_KEYSTRING ||= "test-keystring";
process.env.ETSY_SHARED_SECRET ||= "test-secret";
process.env.ETSY_REDIRECT_URI ||= "http://localhost:3000/api/integrations/etsy/callback";
process.env.SHOPIFY_STORE_DOMAIN ||= "printflow-test.myshopify.com";
process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||= "shpat_test";
process.env.VINTED_ACCESS_TOKEN = "test-access-key,test-signing-key";
process.env.VINTED_ENVIRONMENT = "production";
