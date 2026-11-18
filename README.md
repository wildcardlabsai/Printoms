# PrintFlow

PrintFlow is a private operating system for a 3D printing business. It brings **Etsy** and **Shopify** orders into one place and runs each item through production, printing, quality control, packing and dispatch.

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
| **All Orders** | Unified Etsy, Shopify and manual orders, with search, view tabs, filters, sorting and pagination. Order detail shows per-item production status, personalisation, customer notes, internal notes, editable priority and deadline, a full history timeline, and hold/cancel/complete actions. Includes a manual order form. |
| **Production Board** | Kanban with nine stages and drag-and-drop (mouse, touch and keyboard). Each order item is its own job. Moving a card into *Printing* starts a tracked print run, and moving it out records the outcome. On mobile it becomes a stage picker with a "Move to…" menu. |
| **Print Farm** | Bambu Lab A1, Flashforge AD5X and Flashforge Adventurer 5M come pre-registered. Each printer has status, its current job with elapsed time against the estimate, a per-printer queue, a maintenance log, print history and a failure log. Failed prints are re-queued for the **same job**, so the order is never duplicated. |
| **Packing & Dispatch** | Ready-to-pack orders, a configurable packing checklist, delivery details, items and quantities with personalisation, carrier/tracking/postage capture, and dispatch history. You can send tracking back to Etsy or Shopify. |
| **Products** | Catalogue with SKU, images (Supabase Storage), category, STL/3MF reference, print time, material, filament estimate, default printer, instructions and costs. Each product can have **multiple marketplace listings**, kept separately per marketplace, plus an estimated unit cost and margin. |
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

**Hosted Supabase:**

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

### Shopify (Admin GraphQL API)

1. In the Shopify **Dev Dashboard**, create an app for your store and set `SHOPIFY_STORE_DOMAIN`.
2. Give it these scopes: `read_orders, read_customers, read_products, read_fulfillments, write_fulfillments, read_merchant_managed_fulfillment_orders, write_merchant_managed_fulfillment_orders`.
3. Request **protected customer data** access (name, email, address). Without it, Shopify withholds customer details.
4. Add the redirect URL `https://YOUR-DOMAIN/api/integrations/shopify/callback`, and copy the client ID and secret into `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`.
5. Redeploy and click **Connect Shopify** to install the app. (If you have a legacy custom-app Admin API token, set `SHOPIFY_ADMIN_ACCESS_TOKEN` instead.)

## Scheduled sync (every 10 minutes)

`vercel.json` schedules `GET /api/cron/sync` every 10 minutes. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set. Each integration then syncs only when its own `sync_interval_minutes` is due, which you can change per integration in the UI.

> **Vercel Hobby plans only allow daily cron jobs.** Use a Pro plan, or call the endpoint from any external scheduler, such as Supabase `pg_cron` + `pg_net`, GitHub Actions, or an uptime monitor:
>
> ```bash
> curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-DOMAIN/api/cron/sync
> ```

### How a sync works

- **Lock:** a database lock (`acquire_sync_lock`) stops cron and manual runs from overlapping.
- **Incremental:** each run fetches from the stored high-water mark minus a 5-minute overlap. A first run imports the configurable *initial import* window (60 days by default).
- **Pagination:** Etsy uses offset paging (100 per page); Shopify uses cursor paging (50 per page) with cost-based throttling.
- **Retries:** network errors, 429s and 5xx responses are retried with exponential backoff and jitter, honouring `Retry-After`.
- **Idempotent ingest:** every order goes through `ingest_marketplace_order`. It upserts on **(marketplace, external order ID)**, overwrites only marketplace-owned columns, and never touches internal notes, priority, deadlines or production stages. Line items upsert on their marketplace line ID.
- **Historical orders:** orders already shipped on the marketplace when first imported arrive as *completed*, so a backfill doesn't flood the production board. Orders cancelled on the marketplace are marked *cancelled*.
- **Fault isolation:** one bad order is logged without failing the run. After repeated failures the schedule backs off (10 → 20 → 40 minutes, up to 6 hours).
- **Time budget:** a run stops pulling new pages after 4 minutes, and the next run continues from the cursor.

**Fulfilment push-back:** after dispatch, **Send tracking** on a shipment calls Etsy's `createReceiptShipment` or Shopify's `fulfillmentCreate`. The result is recorded on the shipment as sent or failed, with the error.

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
scripts/test-sync-engine.ts    Sync engine integration test (mocked marketplace APIs)
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
npm run test:sync     # sync engine against mocked Etsy/Shopify APIs (needs local Supabase + .env.local)
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
