import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MapPin, Phone, ShoppingBag } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/misc";
import { SampleBadge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/status-badges";
import { OrdersTable } from "@/components/orders/orders-table";
import { NotesPanel } from "@/components/orders/notes-panel";
import { EditCustomerButton, MergeCustomerButton } from "@/components/customers/customer-edit";
import { findMergeCandidates, getCustomer } from "@/lib/data/customers";
import { getNotes, listOrders } from "@/lib/data/orders";
import { hasRole, requireUser } from "@/lib/auth";
import { addressLines, formatCurrency, formatDate } from "@/lib/utils";
import type { OrderSource } from "@/lib/constants";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const customer = await getCustomer(id);
  if (!customer) notFound();
  const canWrite = hasRole(user, "staff");
  const [orders, notes, candidates] = await Promise.all([
    listOrders({ customerId: id, view: "all", pageSize: 50 }),
    getNotes("customer", id),
    canWrite ? findMergeCandidates(id, customer.display_name, customer.email) : Promise.resolve([]),
  ]);
  const s = customer.summary;
  const currency = s?.currency ?? "GBP";
  const aov = s && s.order_count ? Number(s.total_spend) / s.order_count : 0;

  return (
    <>
      <Link href="/customers" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Customers
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={customer.display_name} className="size-12 text-sm" />
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.02em] text-ink">
              {customer.display_name} {customer.is_sample ? <SampleBadge /> : null}
            </h1>
            <p className="text-sm text-muted">Customer since {formatDate(customer.created_at)}</p>
          </div>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            <MergeCustomerButton targetId={customer.id} targetName={customer.display_name} candidates={candidates} />
            <EditCustomerButton customer={customer} />
          </div>
        ) : null}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Orders" value={s?.order_count ?? 0} />
        <StatCard label="Total spend" value={formatCurrency(s?.total_spend ?? 0, currency)} />
        <StatCard label="Average order" value={formatCurrency(aov, currency)} />
        <StatCard label="Last order" value={<span className="text-xl">{formatDate(s?.last_order_at)}</span>} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden">
            <CardHeader icon={<ShoppingBag />} title="Order history" />
            {orders.rows.length ? <div className="border-t border-line"><OrdersTable rows={orders.rows} /></div> : <EmptyState compact title="No orders" />}
          </Card>
          <Card>
            <CardHeader title="Internal notes" />
            <CardContent>
              <NotesPanel entityType="customer" entityId={customer.id} notes={notes} currentUserId={user.id} canWrite={canWrite} revalidate={`/customers/${customer.id}`} />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Contact" />
            <CardContent className="space-y-2.5 text-sm">
              <p className="flex items-center gap-2 text-ink-2"><Mail className="size-4 text-faint" /> {customer.email ? <a href={`mailto:${customer.email}`} className="hover:text-brand-700">{customer.email}</a> : <span className="text-muted">No email</span>}</p>
              <p className="flex items-center gap-2 text-ink-2"><Phone className="size-4 text-faint" /> {customer.phone ?? <span className="text-muted">No phone</span>}</p>
              {customer.notes ? <p className="rounded-lg bg-subtle px-3 py-2 whitespace-pre-wrap text-ink-2 ring-1 ring-line">{customer.notes}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Marketplace identities" description="How this customer is matched on future imports" />
            <CardContent>
              {customer.identities.length ? (
                <ul className="space-y-2">
                  {customer.identities.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 text-sm">
                      <SourceBadge source={i.source as OrderSource} />
                      <span className="truncate font-mono text-xs text-muted">{i.external_customer_id}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No marketplace IDs — matched by email only.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader icon={<MapPin />} title="Delivery addresses" />
            <CardContent>
              {customer.addresses.length ? (
                <ul className="space-y-3">
                  {customer.addresses.map((a) => (
                    <li key={a.id} className="rounded-lg border border-line px-3 py-2 text-sm text-ink-2">
                      {addressLines(a).map((l, i) => <span key={i} className="block">{l}</span>)}
                      <span className="mt-1 block text-xs text-faint">Last used {formatDate(a.last_used_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No addresses recorded.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
