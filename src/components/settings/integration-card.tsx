"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, DatabaseBackup, ExternalLink, KeyRound, Link2, RefreshCw, ShieldAlert, Unlink } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Checkbox, Field, Select } from "@/components/ui/form";
import { DescriptionList } from "@/components/ui/misc";
import { IntegrationStatusBadge } from "@/components/ui/status-badges";
import { useToast } from "@/components/ui/toast";
import { disconnectIntegrationAction, updateIntegrationSettingsAction } from "@/lib/actions/settings";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";
import type { IntegrationOverview } from "@/lib/data/integrations";
import { ResyncDialog } from "./resync-dialog";

type Integration = IntegrationOverview["integrations"][number];

const BRAND = {
  etsy: { name: "Etsy", api: "Etsy Open API v3", glyph: "bg-orange-500", letter: "E" },
  shopify: { name: "Shopify", api: "Shopify Admin GraphQL API", glyph: "bg-brand-600", letter: "S" },
} as const;

export function IntegrationCard({ integration, canManage }: { integration: Integration; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const brand = BRAND[integration.provider];
  const connected = integration.status === "connected" || integration.status === "error";
  const [syncing, setSyncing] = React.useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false);
  const [resyncOpen, setResyncOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [enabled, setEnabled] = React.useState(integration.sync_enabled);
  const [interval, setIntervalMinutes] = React.useState(String(integration.sync_interval_minutes));
  const [importDays, setImportDays] = React.useState(String(integration.initial_import_days));
  const dirty =
    enabled !== integration.sync_enabled ||
    interval !== String(integration.sync_interval_minutes) ||
    importDays !== String(integration.initial_import_days);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/integrations/${integration.provider}/sync`, { method: "POST" });
      const body = (await res.json()) as { ok: boolean; message?: string; error?: string; status?: string };
      if (body.ok) toast({ title: `${brand.name} sync ${body.status === "partial" ? "partly completed" : "complete"}`, description: body.message });
      else toast({ title: `${brand.name} sync failed`, description: body.error ?? body.message, tone: "error" });
    } catch {
      toast({ title: "Could not reach the server", tone: "error" });
    } finally {
      setSyncing(false);
      router.refresh();
    }
  };

  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3.5 px-5 pt-5">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white shadow-sm", brand.glyph)} aria-hidden>
          {brand.letter}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{brand.name}</h3>
            <IntegrationStatusBadge status={integration.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-muted">
            {connected ? (
              <>
                {integration.display_name ?? "Connected shop"}
                {integration.shop_domain ? ` · ${integration.shop_domain.replace(/^https?:\/\//, "")}` : ""}
              </>
            ) : (
              brand.api
            )}
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-4 px-5 py-4">
        {integration.status === "error" && integration.last_error ? (
          <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Last sync failed {integration.last_error_at ? formatRelative(integration.last_error_at) : ""}</p>
              <p className="mt-0.5 [overflow-wrap:anywhere]">{integration.last_error}</p>
              {integration.consecutive_failures > 1 ? (
                <p className="mt-1 text-xs">{integration.consecutive_failures} consecutive failures — retries are backing off.</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {integration.provider === "shopify" && integration.customer_data_access === "restricted" ? (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-[13px] text-amber-900">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Shopify is withholding customer details</p>
              <p className="mt-0.5">
                Orders and items import normally, but names, emails and addresses are marked as restricted. Request protected
                customer data access for your app in Shopify; details fill in automatically on the next sync once approved.
              </p>
            </div>
          </div>
        ) : null}

        {!integration.config.ready ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-[13px] text-amber-900">
            <p className="flex items-center gap-1.5 font-medium">
              <KeyRound className="size-4" /> Server configuration needed
            </p>
            <p className="mt-1">Add these environment variables, then redeploy/restart:</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {integration.config.missing.map((m) => (
                <li key={m} className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-amber-200">{m}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <DescriptionList
          items={[
            { label: "Connection method", value: integration.config.mode ?? "—" },
            { label: "Connected", value: integration.connected_at ? formatDateTime(integration.connected_at) : "Not connected" },
            {
              label: "Last successful sync",
              value: integration.last_successful_sync_at ? (
                <span title={formatDateTime(integration.last_successful_sync_at)}>{formatRelative(integration.last_successful_sync_at)}</span>
              ) : (
                "Never"
              ),
            },
            {
              label: "Next scheduled sync",
              value:
                connected && integration.sync_enabled && integration.next_sync_at
                  ? integration.sync_due
                    ? "Due now"
                    : formatRelative(integration.next_sync_at)
                  : connected && !integration.sync_enabled
                    ? "Automatic sync off"
                    : "—",
            },
            { label: "Synced up to", value: integration.sync_cursor ? formatDateTime(integration.sync_cursor) : "Initial import pending" },
            {
              label: "Orders awaiting retry",
              value: integration.open_failures ? <span className="text-red-600">{integration.open_failures}</span> : "None",
            },
            {
              label: "Order history available",
              value:
                integration.provider === "shopify" && !integration.has_all_orders_scope
                  ? `Last ${integration.max_import_days} days (no read_all_orders)`
                  : `Up to ${integration.max_import_days} days`,
            },
          ]}
        />

        {canManage && connected ? (
          <div className="space-y-3 rounded-xl border border-line bg-subtle/60 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Automatic sync
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Every" htmlFor={`int-${integration.provider}`}>
                <Select id={`int-${integration.provider}`} value={interval} onChange={(e) => setIntervalMinutes(e.target.value)} disabled={!enabled}>
                  {[5, 10, 15, 30, 60, 180].map((m) => (
                    <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Initial import" htmlFor={`days-${integration.provider}`}>
                <Select id={`days-${integration.provider}`} value={importDays} onChange={(e) => setImportDays(e.target.value)}>
                  {integration.import_options.map((d) => (
                    <option key={d} value={d}>Last {d} days</option>
                  ))}
                  {!integration.import_options.includes(integration.initial_import_days) ? (
                    <option value={integration.initial_import_days} disabled>
                      Last {integration.initial_import_days} days (not available)
                    </option>
                  ) : null}
                </Select>
              </Field>
            </div>
            {dirty ? (
              <Button
                size="sm"
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await updateIntegrationSettingsAction(integration.provider, {
                      sync_enabled: enabled,
                      sync_interval_minutes: interval,
                      initial_import_days: importDays,
                    });
                    toast(res.ok ? { title: res.message ?? "Saved" } : { title: res.error, tone: "error" });
                    if (res.ok) router.refresh();
                  })
                }
              >
                Save sync settings
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {canManage ? (
        <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
          {connected ? (
            <>
              <Button onClick={syncNow} loading={syncing} disabled={!integration.config.ready}>
                <RefreshCw /> Sync now
              </Button>
              <Button variant="outline" onClick={() => setResyncOpen(true)} disabled={!integration.config.ready}>
                <DatabaseBackup /> {integration.pending_resync ? "Resume resync" : "Full resync"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDisconnect(true)}>
                <Unlink /> Disconnect
              </Button>
            </>
          ) : integration.config.ready ? (
            <ButtonLink href={`/api/integrations/${integration.provider}/connect`} prefetch={false}>
              <Link2 /> Connect {brand.name}
            </ButtonLink>
          ) : (
            <Button disabled title="Add the missing environment variables first">
              <Link2 /> Connect {brand.name}
            </Button>
          )}
          <ButtonLink href={`#setup-${integration.provider}`} variant="ghost" className="ml-auto">
            Setup guide <ExternalLink />
          </ButtonLink>
        </div>
      ) : null}

      {canManage && connected ? (
        <ResyncDialog
          provider={integration.provider}
          name={brand.name}
          options={integration.import_options}
          maxDays={integration.max_import_days}
          pendingFrom={integration.pending_resync}
          open={resyncOpen}
          onOpenChange={setResyncOpen}
        />
      ) : null}

      <Dialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <DialogContent size="sm" title={`Disconnect ${brand.name}?`} description="Stored access tokens are deleted. Orders already imported are kept, along with all production data.">
          <DialogBody>
            <p className="text-sm text-ink-2">Automatic imports stop until you reconnect. You can reconnect at any time — orders are matched by marketplace ID so nothing is duplicated.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDisconnect(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await disconnectIntegrationAction(integration.provider);
                  toast(res.ok ? { title: res.message ?? "Disconnected" } : { title: res.error, tone: "error" });
                  setConfirmDisconnect(false);
                  router.refresh();
                })
              }
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
