# PrintFlow

PrintFlow is a private operating system for a 3D printing business. It brings **Etsy**, **Shopify** and **Vinted Pro** orders into one place and runs each item through production, printing, quality control, packing and dispatch.

It's a working, database-backed application, not a set of mock screens. Every figure comes from your Supabase database, and marketplace connections only show as connected once you've supplied real credentials.

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Quick start (local)](#quick-start-local)
4. [Environment variables](#environment-variables)
5. [Database & migrations](#database--migrations)
6. [Marketplace credentials](#marketplace-credentials)
7. [Scheduled sync (every 10 minutes)](#scheduled-sync-every-10-minutes)
8. [Deploying to Vercel](#deploying-to-vercel)
9. [Architecture](#architecture)
10. [Security model](#security-model)
11. [Sample data](#sample-data)
12. [Testing & quality checks](#testing--quality-checks)
13. [Known limitations & next steps](#known-limitations--next-steps)

---

## Features

| Module | What it does |
| --- | --- |
| **Overview** | Live KPIs (new today, awaiting production, printing, ready to pack, awaiting dispatch, overdue, sales by channel), a 30-day sales chart, source breakdown, production queue, deadlines, printer availability and recent activity. |
| **All Orders** | Unified Etsy, Shopify, Vinted Pro and manual orders, with search, view tabs, filters, sorting and pagination. Order detail shows per-item production status, personalisation, customer notes, internal notes, editable priority and deadline, a full history timeline, and hold/cancel/complete actions. Includes a manual order form. |
| **Production Board** | Kanban with nine stages and drag-and-drop (mouse, touch and keyboard). Each order item is its own job. Moving a card into *Printing* starts a tracked print run, and moving it out records the outcome. On mobile it becomes a stage picker with a "Move to…" menu. Every job tracks its **physical units**, so a 5-item job shows how many units are printed, printing, passed and outstanding. Plates can print some of the units, partial failures re-queue only the failed units, and a job can't move to packing with units unprinted unless you confirm. |
| **Print Farm** | Bambu Lab A1, Flashforge AD5X and Flashforge Adventurer 5M come pre-registered. Each printer has status, its current job with elapsed time against the estimate, a per-printer queue, a maintenance log, print history and a failure log. Failed prints are re-queued for the **same job**, so the order is never duplicated. |
| **Packing & Dispatch** | Ready-to-pack orders, a configurable packing checklist, delivery details, items and quantities with personalisation, carrier/tracking/postage capture, and dispatch history. You can send tracking back to Etsy or Shopify. |
| **Products** | Catalogue with SKU, images (Supabase Storage), category, STL/3MF reference, print time, material, filament estimate, default printer, instructions and costs. Each product can have **multiple marketplace listings**, kept separately per marketplace, plus an estimated unit cost and margin. **Import from marketplace** (admins) brings Etsy listings and Shopify products in without duplicates: already-linked listings are only refreshed, a matching SKU links to the existing product, similar names are suggested for you to confirm, and you review every row before anything is saved. Existing product details are never overwritten (only blank fields are filled), images are copied into storage, and earlier order lines for the listing are linked. Running it again changes nothing. |
| **Filament Inventory** | Spools with brand, material, colour, weight, remaining, price, supplier, purchase date and low-stock threshold. Every stock change is a ledger entry. **Nothing is deducted until consumption is recorded or confirmed.** |
| **Customers** | Unified customers, matched by marketplace customer ID or exact email and **never by name**. Shows addresses, order history, spend and notes, plus a deliberate, atomic "merge duplicates" tool. |
| **Analytics** | Date-range presets or a custom range, with comparison to the previous period. Covers net revenue by channel, AOV, monthly comparison, daily volume, best sellers, production times and failure rate, fulfilment turnaround, and recorded filament costs. Revenue, costs and **estimated** profit are shown separately, with the assumptions spelled out. |
| **Settings & Integrations** | Business settings and cost assumptions; Etsy and Shopify connection status, last and next sync, sync history with errors, a manual "Sync now", per-integration interval, and built-in setup guides; team approval and roles; profile and password; sample data tools. |

The app also includes global search (⌘K), a notification centre (overdue orders, deadlines due soon, prints overrunning their estimate, low filament, sync errors, accounts awaiting approval), and loading, empty and error states throughout.

## Tech stack

- **Next.js 16** (App Router, Server Components, Server Actions, Route Handlers, `proxy.ts`) with **TypeScript**
- **Tailwind CSS v4**, **Radix UI** primitives, **Lucide** icons, **Recharts**, **dnd-kit**
- **React Hook Form** + **Zod**. The same schemas validate on the client and again on the server.
- **Supabase**: PostgreSQL, Auth, Storage and Row Level Security
- Vercel-compatible: serverless route handlers and Vercel Cron

> `cacheComponents` is deliberately **off**. Every PrintFlow screen is authenticated and shows live per-request data, so static shells add little. Revisit this when Next.js makes it the default.

## Quick start (local)

Prerequisites: Node 20+ and Docker (for the local Supabase stack).

```bash
npm install
npx supabase start                # starts Postgres, Auth, Storage, REST locally
npx supabase db reset             # applies all migrations in supabase/migrations
cp .env.example .env.local        # then fill in the values printed by `supabase status`
npm run dev                       # http://localhost:3000
```

1. Open `http://localhost:3000`. On a fresh install you'll see **Create the owner account**. The first account becomes the active owner.
2. Optionally go to **Settings → Data → Load sample data** to explore with clearly labelled fictitious records.
3. Add your real products and filament, then connect your marketplaces under **Settings → Integrations**.

## Environment variables

See `.env.example` for the full list.

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | browser + server | Public key. Safe in the browser; RLS protects data. |
| `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) | **server only** | Marketplace sync, cron and credential storage |
| `TOKEN_ENCRYPTION_KEY` | **server only** | 64 hex chars (`openssl rand -hex 32`). Encrypts OAuth tokens at rest. |
| `CRON_SECRET` | **server only** | Authorises `/api/cron/sync` |
| `NEXT_PUBLIC_SITE_URL` | server | Public base URL, used for OAuth redirects and auth emails |
| `ETSY_API_KEYSTRING`, `ETSY_SHARED_SECRET`, `ETSY_REDIRECT_URI` | **server only** | Etsy Open API v3 app |
| `SHOPIFY_STORE_DOMAIN` | **server only** | `your-store.myshopify.com` |
| `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | **server only** | OAuth installation (Dev Dashboard app) |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | **server only** | Alternative: an existing Admin API token |
| `SHOPIFY_API_VERSION` | server | Defaults to `2025-10` |
| `SHOPIFY_REQUEST_ALL_ORDERS` | server | `true` to also request `read_all_orders` (order history older than 60 days). Off by default. |
| `VINTED_ACCESS_TOKEN` | **server only** | Vinted Pro Integrations access token exactly as generated in the portal: `access-key,signing-key` |
| `VINTED_ENVIRONMENT` | server | `production` (default) or `sandbox` for Vinted's dev-mode environment |

No marketplace secret uses the `NEXT_PUBLIC_` prefix. All server modules that read secrets import `server-only`, so the build fails if one is accidentally imported into browser code.

If Supabase isn't configured, the app shows a **Connect your database** screen rather than failing.

## Database & migrations

The migrations live in `supabase/migrations/`:

| File | Contents |
| --- | --- |
| `…01_core_schema.sql` | Enums and all tables: profiles, business_settings, customers (+ identities, addresses), products, product_listings, printers, orders, order_items, production_jobs, print_queue, print_runs, filament_stock, filament_usage, shipments, integrations, integration_credentials, sync_logs, internal_notes, activity_log. Also UUID PKs, FKs, indexes, check constraints and `updated_at` triggers. |
| `…02_functions_and_triggers.sql` | Auth helpers, the profile bootstrap (first user is owner), privilege-escalation guard, derived order status, job history, the filament ledger, **idempotent `ingest_marketplace_order`**, manual order creation, hold/release, print workflow (`assign`/`start`/`finish_print_run`), pack/dispatch/complete, the sync lock, the sample-data purge, and the three initial printers. |
| `…03_row_level_security.sql` | RLS on every table, role-based policies and function grants |
| `…04_storage.sql` | Private `product-images` and `model-files` buckets, with policies |
| `…05_analytics.sql` | `dashboard_metrics`, `analytics_report`, and the customer/filament summary views |
| `…06_customer_merge.sql` | Explicit, atomic customer merge |
| `…20261119000001_sync_reliability.sql` | Phase 1: `sync_failures` retry queue, sync-log retry/recovery counters and warnings, `orders.customer_data_status`, `order_items.marketplace_options`, the `resync` trigger and the updated `ingest_marketplace_order` (force mode, restricted-customer handling). Additive only. |
| `…20261119000002_production_units.sql` | Phase 2: `production_units` (one row per physical item) and `print_run_units`, per-job unit counters, partial-plate `start_print_run`/`finish_print_run`, `record_qc_failure`. Backfills units for existing jobs from their stage and history. Additive only. |
| `…20261119000003_order_reconciliation.sql` | Phase 2: `order_reviews` (marketplace changes needing a decision), `orders.requires_review`, line-item status columns, `apply_order_cancellation`, `reopen_cancelled_order`, `resolve_order_review`, the `assert_order_shippable` guard on pack/dispatch, and the reconciling `ingest_marketplace_order`. Additive only. |
| `…20261119000004_fulfilment_and_failures.sql` | Phase 2: `fulfilment_submissions` (every tracking submission, one in flight per shipment), `sync_failure_events` (failure audit history), dismiss/reopen for failed orders. Additive only. |
| `…20261120000001_product_import.sql` | `import_marketplace_listing`: applies one reviewed product-import decision atomically (per-listing lock; never duplicates; fills only blank product fields; links unmapped order lines). |
| `…20261120000002_vinted_enums.sql` | Adds `vinted` to `order_source` and `integration_provider` (on its own, because a new enum value can't be used in the same transaction). |
| `…20261120000003_vinted.sql` | The Vinted integration row and Vinted figures in the dashboard and analytics functions. |

**Hosted Supabase:**

*No command line:* for a **new, empty** project, open Supabase → SQL Editor → New query, paste the whole of `supabase/setup/printflow_full_setup.sql` and click **Run** (once). It applies all migrations in one transaction (all or nothing) and records them, so `supabase db push` works for later migrations. A project set up with the earlier setup file (migrations up to `20261119000004`) runs `supabase/setup/update_20261119000004_part1.sql` and then `…_part2.sql` as two separate queries instead. Regenerate these files with `node scripts/build-setup-sql.mjs` after adding a migration.

*With the CLI:*

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push               # applies the migrations
```

After a schema change, regenerate the TypeScript types with `npm run db:types` (local stack). Point it at a linked project by editing the script to `supabase gen types typescript --linked`.

## Marketplace credentials

Step-by-step guides are also built into **Settings → Integrations**, including your exact redirect URLs and a copy button.

### Etsy (Open API v3, OAuth 2.0 with PKCE)

1. Go to <https://www.etsy.com/developers/your-apps> and create an app, using the account that owns the shop.
2. Once approved, copy the **Keystring** to `ETSY_API_KEYSTRING` and the **Shared secret** to `ETSY_SHARED_SECRET`.
3. Add the callback URL `https://YOUR-DOMAIN/api/integrations/etsy/callback` to the app, and set `ETSY_REDIRECT_URI` to the same value.
4. Redeploy, then click **Connect Etsy**. The requested scopes are `transactions_r transactions_w listings_r shops_r email_r`.

Access tokens last one hour and are refreshed automatically. Etsy rotates refresh tokens, and PrintFlow stores the new one each time. PrintFlow sends the API key as `keystring:shared_secret` in the `x-api-key` header. If your app predates that requirement and rejects it, you can leave `ETSY_SHARED_SECRET` empty to send the keystring alone.

### Vinted Pro (Pro Integrations API — orders)

Vinted Pro Integrations is only available to **allowlisted Vinted Pro businesses** (ask your Vinted account manager or Vinted Pro support).

1. Sign in to the Vinted Pro Integrations Portal (production mode) and generate an **access token**. It is shown once and looks like `access-key,signing-key`.
2. Set `VINTED_ACCESS_TOKEN` to the whole token (Sensitive), redeploy, and click **Connect Vinted**. The token is verified with a read-only request.
3. Every request is signed (HMAC-SHA256 over `timestamp.METHOD.path?query.accessKey.body`, per Vinted's reference script).

How it syncs: Vinted's order list gives only id, date and status, and orders have no "updated" time, so each run reads the list and fetches full details only for new orders in the import window and orders whose Vinted status changed. Cancelled on Vinted → the normal cancellation rules apply; shipped/delivered/completed → recorded as shipped outside PrintFlow. Vinted creates the shipping label and tracks the parcel, so PrintFlow **never sends tracking to Vinted**; the packing screen has **Download Vinted label (PDF)** (labels exist only for items listed through the API). Order totals are the seller payout Vinted reports, so no Vinted fee is deducted again in profit estimates. Items not listed through the API have no item ID on Vinted, so they appear as unlinked lines you can map to a product.

### Shopify (Admin GraphQL API)

1. In the Shopify **Dev Dashboard**, create an app for your store and set `SHOPIFY_STORE_DOMAIN`.
2. Give it these scopes: `read_orders, read_customers, read_products, read_fulfillments, write_fulfillments, read_merchant_managed_fulfillment_orders, write_merchant_managed_fulfillment_orders`.
3. Request **protected customer data** access (name, email, address). Without it, Shopify withholds customer details. PrintFlow still imports the orders and line items, marks the withheld fields as *restricted* (shown on the order and packing screens), and fills them in automatically on the next sync once access is approved.
4. Add the redirect URL `https://YOUR-DOMAIN/api/integrations/shopify/callback`, and copy the client ID and secret into `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`.
5. **Order history:** without the `read_all_orders` scope, Shopify only returns the last **60 days** of orders, and PrintFlow limits its import options to match. To import older orders, add `read_all_orders` to the app's scopes, set `SHOPIFY_REQUEST_ALL_ORDERS=true`, and reconnect. PrintFlow reads the scopes actually granted and only offers windows they support.
6. Redeploy and click **Connect Shopify** to install the app. (If you have a legacy custom-app Admin API token, set `SHOPIFY_ADMIN_ACCESS_TOKEN` instead.)

## Scheduled sync (every 10 minutes)

Each marketplace syncs **independently**, with its own endpoint, function run, time budget, lock, cursor and log:
`GET /api/cron/sync/etsy` and `GET /api/cron/sync/shopify`. Both require `Authorization: Bearer $CRON_SECRET`. The combined `/api/cron/sync` still works and runs both in parallel, isolated from each other.

> **A server-side scheduler is required.** `vercel.json` deliberately contains no cron jobs, because Vercel **Hobby** rejects any cron more frequent than once a day. Choose one of these:
> - Supabase `pg_cron` + `pg_net` (recommended, works on any plan)
> - Vercel Pro crons
> - the included GitHub Actions workflow
>
> Step-by-step instructions are in **[docs/scheduling.md](docs/scheduling.md)**.

### How a sync works

- **Lock:** a database lock (`acquire_sync_lock`) stops cron and manual runs from overlapping.
- **Incremental:** each run fetches from the stored high-water mark minus a 5-minute overlap. A first run imports the configurable *initial import* window (60 days by default).
- **Pagination:** Etsy uses offset paging (100 per page); Shopify uses cursor paging (50 per page) with cost-based throttling.
- **Retries:** reads (GET, GraphQL queries) are retried on network errors, 429s and 5xx with exponential backoff and jitter, honouring `Retry-After`. **Writes** (tracking submissions, mutations, token exchange) are only retried automatically on 429 — never after a timeout or 5xx, because the marketplace may already have applied them.
- **Idempotent ingest:** every order goes through `ingest_marketplace_order`. It upserts on **(marketplace, external order ID)**, overwrites only marketplace-owned columns, and never touches internal notes, priority, deadlines or production stages. Line items upsert on their marketplace line ID.
- **Historical orders:** orders already shipped on the marketplace when first imported arrive as *completed*, so a backfill doesn't flood the production board. Orders cancelled on the marketplace are marked *cancelled*.
- **Failed-order recovery:** an order that fails to import is recorded in `sync_failures` with its payload and error, and shown under **Settings → Integrations → Failed orders** (Open / Dismissed / Resolved, each with its full history). The cursor is held at that order for up to 3 attempts so it's fetched again from the marketplace. After that it is retried from the stored payload on every run, and it is cleared the moment it imports. Stale retries can never overwrite newer marketplace data. Admins can **Retry now** (same idempotent ingest), **Dismiss** with a required reason (it then stops being retried, no longer holds the cursor, and stays dismissed even if it fails again) or **Reopen** it. Each open failure shows when it will next be retried.
- **Marketplace changes after import:** cancellations, added/removed lines, quantity, variation and personalisation changes are reconciled against production. Anything that can be applied safely (nothing printed yet) is applied and logged; anything that affects work already started raises an **order review** ("Needs review" tab) and blocks packing/dispatch until someone decides — close the jobs (printed items kept as surplus), reprint affected units, return to production, or acknowledge. Printed work is never discarded automatically.
- **Personalisation:** Etsy variations and Shopify line-item properties are classified by label. Labels such as *Personalisation*, *Custom text*, *Name to engrave*, *Enter your name* and *Gift message* become personalisation; *Size*, *Colour*, *Material* and so on stay variations. The untouched original data is kept in `order_items.marketplace_options`.
- **Full resync (admins):** **Settings → Integrations → Full resync** re-applies marketplace data to every order in a chosen window, even when the marketplace timestamp hasn't changed. It never duplicates orders or jobs and never changes notes, priorities, deadlines, printer assignments, stages, print history or shipments. It is logged, requires confirmation, and can be resumed if it pauses.
- **Fault isolation:** one bad order is logged without failing the run. After repeated failures the schedule backs off (10 → 20 → 40 minutes, up to 6 hours).
- **Time budget:** a run stops pulling new pages after 4 minutes, and the next run continues from the cursor.

**Fulfilment push-back:** after dispatch, **Send tracking** on a shipment calls Etsy's `createReceiptShipment` or Shopify's `fulfillmentCreate`. Safeguards:

- only real, dispatched marketplace orders (never sample or manual orders), with a validated tracking number (placeholders such as `TBC` are rejected) and an https tracking link;
- carriers are mapped to each marketplace's names (`src/lib/integrations/carriers.ts`);
- one submission in flight per shipment, and "sent" is final;
- before every submission the marketplace is checked for the tracking number, so a retry after a timeout never creates a duplicate fulfilment;
- each attempt is stored in `fulfilment_submissions` with its request, response and an error category (credentials, rate limited, rejected, marketplace error, network);
- the order's dispatch status is never changed by a failed push, and **Retry sending tracking** is always safe.

**Verify on a live store before relying on it:** Etsy's accepted `carrier_name` values for your shipping country, and that Shopify accepts the mapped company names for your store.

**Webhooks (future phase):** the `MarketplaceAdapter` interface and the `webhook` value in `sync_trigger` are already in place. A webhook route would verify the signature and call `runSync(provider, "webhook")` or ingest the payload directly.

## Deploying to Vercel

1. Create a Supabase project and run `npx supabase db push`.
2. In Supabase **Authentication → URL configuration**, set the Site URL to your domain and add `https://YOUR-DOMAIN/auth/callback` as a redirect URL.
3. Import the repository into Vercel and add every environment variable above to *Production*.
4. Deploy, open the site and create the owner account.
5. **Recommended:** turn off public sign-ups in Supabase (Authentication → Providers → Email) once your team has joined. Accounts that sign up later can't see any data until an owner approves them anyway.
6. Add the Etsy and Shopify callback URLs and connect your marketplaces.

## Architecture

```
src/
  proxy.ts                     Session refresh + optimistic route protection (Next 16 "proxy")
  app/
    (app)/…                    Authenticated modules (layout = app shell)
    login, auth/*, setup-required
    api/cron/sync              Scheduled sync (Bearer CRON_SECRET)
    api/integrations/*         OAuth connect/callback, manual sync
  components/
    ui/                        Design system (buttons, cards, badges, forms, dialogs…)
    layout/                    Sidebar, top bar, mobile nav, search, notifications
    charts/                    Recharts components with a validated colour palette
    orders|production|printers|fulfilment|products|filament|customers|settings/
  lib/
    auth.ts                    Data Access Layer (verifies session + role)
    data/*                     Server-side queries (RLS enforced)
    actions/*                  Server actions (Zod-validated, role-checked)
    validation/*               Shared Zod schemas
    integrations/
      types.ts                 MarketplaceAdapter interface + normalised order shape
      etsy/ shopify/           OAuth, API clients, mappers, adapters
      sync.ts                  Sync engine     fulfilment.ts  Tracking push-back
      crypto.ts                AES-256-GCM     http.ts        Retry/backoff
supabase/migrations/           Schema, functions, RLS, storage, analytics
tests/unit, tests/integration  node:test suites (fake marketplace APIs, local Supabase only)
```

**Adding a marketplace:** implement `MarketplaceAdapter` (`fetchOrders` and `pushFulfilment`), map its orders to `NormalisedOrder`, register it in `integrations/registry.ts`, and add the value to the `integration_provider` and `order_source` enums.

**Key domain rules:**

- **One job per item:** every order item gets exactly one production job (`unique(order_item_id)`). Reprints are new `print_runs` on that job.
- **Derived order status:** the order's status comes from its jobs via a trigger, so the UI, sync and SQL functions always agree.
- **Explicit workflows:** multi-step workflows (start/finish print, pack, dispatch, hold, manual order, ingest) are single Postgres functions, so they are atomic.
- **Audit trail:** `activity_log` is append-only. It records imports, syncs, stage changes, prints, failures, packing, dispatch, notes and settings changes.

## Security model

- **Authentication:** Supabase Auth. The DAL verifies the session with `auth.getUser()`, not just the cookie, and `proxy.ts` gives a fast redirect for signed-out users.
- **Roles:**

  | Role | Access |
  | --- | --- |
  | `viewer` | Read only |
  | `staff` | Operational writes |
  | `admin` | Settings, integrations, team, deletes |
  | `owner` | Can also grant the owner role |

  These are enforced **in the database** via RLS and guarded RPCs, and again in every server action.
- **First user:** the first user becomes owner. Later sign-ups are inactive until approved. A trigger stops anyone changing their own role or activation, and stops the last owner being removed.
- **Secrets:**
  - Marketplace secrets live only in server environment variables.
  - OAuth tokens are encrypted with AES-256-GCM and stored in `integration_credentials`, which has RLS enabled and **no policies**, so only the service role can read it.
  - The OAuth flows use a `state` cookie, PKCE for Etsy, and HMAC verification for Shopify.
- **Cron:** the cron endpoint uses a constant-time comparison of the bearer secret.
- **Input validation:** Zod on every server action, plus database `CHECK` constraints.

## Sample data

**Settings → Data → Load sample data** (admins only) creates 18 orders across Etsy, Shopify and manual sales, plus products, customers, spools, print history and one active print.

Every sample record is clearly marked:

- `is_sample = true` in the database
- `example.com` customer emails
- `SAMPLE-` marketplace IDs, which are never sent to a marketplace
- a **Sample** badge in the UI
- a notice on the dashboard and in analytics while sample data is loaded

**Remove sample data** deletes only flagged records.

## Testing & quality checks

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint (Next core-web-vitals + TypeScript)
npm run build         # production build
npm run test:unit         # pure logic: personalisation, Shopify permission errors, import windows, cursor, resync validation
npm run test:integration  # sync, reconciliation, production units, fulfilment and failure management against fake Etsy/Shopify APIs on a LOCAL Supabase stack (refuses remote databases)
npm test                  # both
E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e   # browser regression (desktop + iPhone) against the running app on localhost; creates and removes its own test records
```

These were verified during development against a local Supabase stack:

- the migrations;
- ingest idempotency and preservation of internal data;
- the print failure → reprint cycle without duplicates;
- pack and dispatch;
- RLS (pending users see nothing and cannot self-promote; secrets are unreadable even to the owner);
- cron and API authorisation;
- browser flows for manual orders, printing, filament deduction, packing, dispatch, products, listings and settings;
- every page at desktop and iPhone widths, with no runtime errors or horizontal overflow.

## Known limitations & next steps

- **No live printer telemetry.** Printer status is set by your team. A future integration (Bambu Lab MQTT/Cloud, Flashforge network API) can update `printers` through the same functions.
- **The real marketplace connections can't be tested in development.** They need your approved Etsy app and Shopify app. The sync engine is covered by the mocked-API test, but do one manual sync after connecting and check the result in the sync history.
- **Shopify only sends customer data with approval.** Customer name, email and address only arrive once protected customer data access is approved.
- **Profit is an estimate.** It uses the fee percentages and costs in Settings, so tune them to your plan. It is not accounting profit.
- **No webhooks yet.** Webhooks, label printing and carrier APIs (e.g. Royal Mail Click & Drop) are natural next phases.
