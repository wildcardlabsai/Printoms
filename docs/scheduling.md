# Scheduling marketplace sync

PrintFlow syncs each marketplace independently. Each one has its own endpoint, run, lock, cursor and log:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/cron/sync/etsy` | Etsy only |
| `GET /api/cron/sync/shopify` | Shopify only |
| `GET /api/cron/sync/vinted` | Vinted Pro only |
| `GET /api/cron/sync` | All marketplaces, run in parallel and isolated (kept for compatibility) |

A marketplace that isn't connected is skipped, so scheduling an endpoint you don't use yet is harmless.

Every request needs `Authorization: Bearer $CRON_SECRET`. A marketplace only syncs when its own interval is due (10 minutes by default), so calling an endpoint more often than that is harmless.

Overlapping calls for the same marketplace are refused by a database lock. That lock lasts at most 330 seconds, so a run that is killed frees its marketplace well before the next one. The next run then records the interrupted run as failed.

**A scheduler is required.** PrintFlow never relies on a browser being open.

## Option A — Supabase `pg_cron` + `pg_net` (recommended, works on any Vercel plan)

Run this once in the Supabase SQL editor, replacing the URL and secret. It stores the secret in Supabase Vault, so it isn't kept in plain text:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('YOUR_CRON_SECRET', 'printflow_cron_secret');

select cron.schedule('printflow-sync-etsy', '*/10 * * * *', $$
  select net.http_get(
    url := 'https://YOUR-DOMAIN/api/cron/sync/etsy',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'printflow_cron_secret')),
    timeout_milliseconds := 300000
  );
$$);

select cron.schedule('printflow-sync-shopify', '*/10 * * * *', $$
  select net.http_get(
    url := 'https://YOUR-DOMAIN/api/cron/sync/shopify',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'printflow_cron_secret')),
    timeout_milliseconds := 300000
  );
$$);

select cron.schedule('printflow-sync-vinted', '*/10 * * * *', $$
  select net.http_get(
    url := 'https://YOUR-DOMAIN/api/cron/sync/vinted',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'printflow_cron_secret')),
    timeout_milliseconds := 300000
  );
$$);
```

To remove the jobs: `select cron.unschedule('printflow-sync-etsy'); select cron.unschedule('printflow-sync-shopify'); select cron.unschedule('printflow-sync-vinted');`

## Option B — Vercel Cron (Pro plan or higher)

Vercel **Hobby** only allows cron jobs that run once a day, and rejects a deployment that asks for more. For that reason `vercel.json` ships *without* crons. On Pro, add:

```json
{
  "crons": [
    { "path": "/api/cron/sync/etsy", "schedule": "*/10 * * * *" },
    { "path": "/api/cron/sync/shopify", "schedule": "*/10 * * * *" },
    { "path": "/api/cron/sync/vinted", "schedule": "*/10 * * * *" }
  ]
}
```

Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set.

## Option C — GitHub Actions

`.github/workflows/printflow-sync.yml` calls both endpoints every 10 minutes as separate, independent jobs. Set the repository variable `PRINTFLOW_BASE_URL` and the secret `PRINTFLOW_CRON_SECRET`. GitHub can delay scheduled workflows at busy times, so treat this as best-effort.

## Function duration

Each sync stops pulling new pages after about 4 minutes and finishes within the 300-second function limit. Any remaining orders continue on the next run. On Vercel, a 300-second limit needs Fluid compute (the default on new projects) or a plan that allows it.
