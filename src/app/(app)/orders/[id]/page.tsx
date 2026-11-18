import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, ExternalLink, History, Mail, MapPin, MessageSquareQuote, Package, Phone, Truck } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SampleBadge } from "@/components/ui/badge";
import { DescriptionList, Notice } from "@/components/ui/misc";
import { OrderStatusBadge, PaymentBadge, ShipmentStatusBadge, SourceBadge } from "@/components/ui/status-badges";
import { ButtonLink } from "@/components/ui/button";
import { ActivityTimeline } from "@/components/orders/activity-timeline";
import { NotesPanel } from "@/components/orders/notes-panel";
import { OrderActions } from "@/components/orders/order-actions";
import { OrderInternalForm } from "@/components/orders/order-internal-form";
import { OrderItemCard } from "@/components/orders/order-item-card";
import { getIntegrationShopDomain, getNotes, getOrder, getOrderActivity, getProductOptions } from "@/lib/data/orders";
import { hasRole, requireUser } from "@/lib/auth";
import { addressLines, externalRef, formatCurrency, formatDate, formatDateTime, formatRelative, isOverdue } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const order = /^[0-9a-f-]{36}$/i.test(id) ? await getOrder(id) : null;
  return { title: order ? `Order ${order.order_number}` : "Order" };
}

function marketplaceUrl(source: string, externalId: string | null, shopDomain?: string | null) {
  if (!externalId) return null;
  if (source === "etsy") return `https://www.etsy.com/your/orders/sold?order_id=${encodeURIComponent(externalId)}`;
  if (source === "shopify" && shopDomain) {
    const numeric = externalId.split("/").pop();
    return `https://${shopDomain}/admin/orders/${numeric}`;
  }
  return null;
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const order = await getOrder(id);
  if (!order) notFound();

  const canWrite = hasRole(user, "staff");
  const [notes, activity, products, shop] = await Promise.all([
    getNotes("order", id),
    getOrderActivity(id),
    canWrite ? getProductOptions() : Promise.resolve([]),
    order.source === "shopify" ? getIntegrationShopDomain("shopify") : Promise.resolve(null),
  ]);

  const mpUrl = marketplaceUrl(order.source, order.external_order_id, shop?.shop_domain);
  const overdue = isOverdue(order.dispatch_by, order.status);
  const address = addressLines(order.shipping_address);
  const unitCount = order.order_items.reduce((s, i) => s + i.quantity, 0);
  const shipment = order.shipments?.[0];

  return (
    <>
      <div className="mb-5">
        <Link href="/orders" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> All orders
        </Link>
      </div>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{order.order_number}</h1>
            <OrderStatusBadge status={order.status} />
            <PaymentBadge status={order.payment_status} />
            {order.is_sample ? <SampleBadge /> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted">
            <SourceBadge source={order.source} />
            {externalRef(order) ? <span className="tabular">Marketplace {externalRef(order)}</span> : null}
            <span>Ordered {formatDateTime(order.order_date)}</span>
            {order.last_synced_at ? <span>Synced {formatRelative(order.last_synced_at)}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mpUrl ? (
            <ButtonLink href={mpUrl} target="_blank" rel="noopener noreferrer" variant="outline">
              <ExternalLink /> Open in {order.source === "etsy" ? "Etsy" : "Shopify"}
            </ButtonLink>
          ) : null}
          {["ready_to_pack", "packed"].includes(order.status) && canWrite ? (
            <ButtonLink href={`/fulfilment?order=${order.id}`}>
              <Package /> Pack & dispatch
            </ButtonLink>
          ) : null}
          {canWrite ? <OrderActions orderId={order.id} status={order.status} /> : null}
        </div>
      </div>

      {overdue ? (
        <Notice tone="danger" icon={<CalendarClock />} title="This order is overdue" className="mb-5">
          The dispatch deadline was {formatDate(order.dispatch_by)} ({formatRelative(order.dispatch_by)}).
        </Notice>
      ) : null}
      {order.status === "cancelled" && order.marketplace_cancelled_at ? (
        <Notice tone="neutral" title="Cancelled on marketplace" className="mb-5">
          This order was cancelled on {order.source === "etsy" ? "Etsy" : "Shopify"} on {formatDate(order.marketplace_cancelled_at)}.
        </Notice>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              icon={<Package />}
              title={`Items (${unitCount})`}
              description="Each line has its own production job and status."
            />
            <CardContent className="space-y-3">
              {order.order_items.map((item) => (
                <OrderItemCard key={item.id} item={item} currency={order.currency} products={products} canWrite={canWrite} />
              ))}
              <div className="ml-auto max-w-xs space-y-1.5 pt-2 text-sm">
                {[
                  ["Subtotal", order.subtotal],
                  ["Shipping", order.shipping_total],
                  ["Tax", order.tax_total],
                  ...(Number(order.discount_total) ? [["Discount", -Number(order.discount_total)] as const] : []),
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between text-muted">
                    <span>{label}</span>
                    <span className="tabular">{formatCurrency(value as number, order.currency)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
                  <span>Total</span>
                  <span className="tabular">{formatCurrency(order.total, order.currency)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {order.customer_note ? (
            <Card>
              <CardHeader icon={<MessageSquareQuote />} title="Note from customer" description={`Provided via ${order.source === "manual" ? "manual entry" : "the marketplace"}`} />
              <CardContent>
                <blockquote className="rounded-lg border-l-4 border-amber-300 bg-amber-50/60 px-4 py-3 text-sm whitespace-pre-wrap text-amber-950">
                  {order.customer_note}
                </blockquote>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Internal notes" description="Team-only discussion about this order." />
            <CardContent>
              <NotesPanel entityType="order" entityId={order.id} notes={notes} currentUserId={user.id} canWrite={canWrite} revalidate={`/orders/${order.id}`} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader icon={<History />} title="Order history" description="Imports, syncs, production and fulfilment events." />
            <CardContent>
              <ActivityTimeline entries={activity} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Production & dispatch" />
            <CardContent>
              <OrderInternalForm
                orderId={order.id}
                canWrite={canWrite}
                marketplaceDeadline={order.marketplace_dispatch_by}
                initial={{
                  priority: order.priority,
                  dispatch_by: order.dispatch_by,
                  production_notes: order.production_notes,
                  shipping_method: order.shipping_method,
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Customer" action={order.customer ? <ButtonLink href={`/customers/${order.customer.id}`} variant="ghost" size="sm">View</ButtonLink> : null} />
            <CardContent className="space-y-3 text-sm">
              <p className="font-medium text-ink">{order.customer_name}</p>
              {order.customer_email ? (
                <a href={`mailto:${order.customer_email}`} className="flex items-center gap-2 text-ink-2 hover:text-brand-700">
                  <Mail className="size-4 text-faint" /> <span className="truncate">{order.customer_email}</span>
                </a>
              ) : (
                <p className="flex items-center gap-2 text-muted"><Mail className="size-4 text-faint" /> No email shared</p>
              )}
              {order.customer?.phone ? (
                <p className="flex items-center gap-2 text-ink-2"><Phone className="size-4 text-faint" /> {order.customer.phone}</p>
              ) : null}
              <div className="flex gap-2 border-t border-line pt-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-faint" />
                {address.length ? (
                  <address className="text-ink-2 not-italic leading-relaxed">
                    {address.map((l, i) => <span key={i} className="block">{l}</span>)}
                  </address>
                ) : (
                  <span className="text-muted">No delivery address</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader icon={<Truck />} title="Shipping" action={shipment ? <ShipmentStatusBadge status={shipment.status} /> : null} />
            <CardContent>
              <DescriptionList
                items={[
                  { label: "Method", value: order.shipping_method ?? "—" },
                  { label: "Dispatch by", value: <span className={overdue ? "text-red-600" : undefined}>{formatDate(order.dispatch_by)}</span> },
                  { label: "Carrier", value: order.carrier ?? shipment?.carrier ?? "—" },
                  {
                    label: "Tracking",
                    value: shipment?.tracking_url ? (
                      <a href={shipment.tracking_url} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                        {order.tracking_number}
                      </a>
                    ) : (
                      order.tracking_number ?? "—"
                    ),
                  },
                  { label: "Dispatched", value: order.dispatched_at ? formatDateTime(order.dispatched_at) : "—" },
                  ...(shipment && shipment.marketplace_push_status !== "not_required"
                    ? [{ label: "Marketplace update", value: shipment.marketplace_push_status.replace("_", " ") }]
                    : []),
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Record" />
            <CardContent>
              <DescriptionList
                items={[
                  { label: "Internal ID", value: order.order_number },
                  { label: "Marketplace ID", value: order.external_order_id ?? "—" },
                  { label: "Marketplace status", value: order.marketplace_status ?? "—" },
                  { label: "Created", value: formatDateTime(order.created_at) },
                  { label: "Updated", value: formatDateTime(order.updated_at) },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
