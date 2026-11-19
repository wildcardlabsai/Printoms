import type { Metadata } from "next";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { getSlipOrders, parseIds, type SlipOrder } from "@/lib/data/print";
import { getBusinessSettings, type BusinessSettings } from "@/lib/data/settings";
import { signedImageUrls } from "@/lib/data/products";
import { ORDER_SOURCE } from "@/lib/constants";
import { addressLines, externalRef, formatCurrency, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Packing slips" };

export default async function SlipsPage({ searchParams }: { searchParams: Promise<{ ids?: string; view?: string }> }) {
  const sp = await searchParams;
  const ids = parseIds(sp.ids);
  const [orders, settings] = await Promise.all([getSlipOrders({ ids, view: sp.view === "to_pack" ? "to_pack" : undefined }), getBusinessSettings()]);
  const logo = settings?.logo_path ? (await signedImageUrls([settings.logo_path]))[settings.logo_path] ?? null : null;

  return (
    <>
      <PrintToolbar
        title="Packing slips"
        count={orders.length}
        back={{ href: "/fulfilment", label: "Packing & Dispatch" }}
        empty="No orders to print — slips are printed for orders that are ready to pack or packed."
      />
      <div className="print-scale space-y-4 py-4 print:space-y-0 print:py-0">
        {orders.map((o) => (
          <Slip key={o.id} order={o} settings={settings} logo={logo} />
        ))}
      </div>
    </>
  );
}

function Slip({ order, settings, logo }: { order: SlipOrder; settings: BusinessSettings | null; logo: string | null }) {
  const tz = settings?.timezone ?? "Europe/London";
  const showPrices = Boolean(settings?.slip_show_prices);
  const lines = addressLines(order.shipping_address);
  const restricted = order.customer_data_status === "restricted" || lines.length === 0;
  const ref = externalRef(order);
  const units = order.order_items.reduce((s, i) => s + i.quantity, 0);
  const money = (v: number) => formatCurrency(v, order.currency);

  return (
    <section className="print-sheet mx-auto flex flex-col bg-white p-[15mm] text-[10.5pt] leading-snug text-black shadow-raised" data-testid="packing-slip">
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="mb-2 max-h-[22mm] max-w-[60mm] object-contain" />
          ) : null}
          <p className="text-[14pt] font-bold">{settings?.business_name ?? "PrintFlow"}</p>
          {settings?.return_address ? <p className="mt-1 whitespace-pre-line text-[9pt] text-zinc-600">{settings.return_address}</p> : null}
          {settings?.contact_email ? <p className="text-[9pt] text-zinc-600">{settings.contact_email}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[18pt] font-bold tracking-tight">Packing slip</p>
          <p className="mt-1 text-zinc-700">Order {order.order_number}</p>
          <p className="text-[9pt] text-zinc-600">
            {ORDER_SOURCE[order.source].label}
            {ref ? ` ${ref}` : ""} · {formatDate(order.order_date, { timeZone: tz, day: "numeric", month: "short", year: "numeric" })}
          </p>
          {order.shipping_method ? <p className="text-[9pt] text-zinc-600">{order.shipping_method}</p> : null}
        </div>
      </header>

      <div className="mt-8 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[8pt] font-semibold tracking-wider text-zinc-500 uppercase">Deliver to</p>
          {restricted ? (
            <p className="mt-1 text-zinc-600">{order.customer_name}<br />Address not available in PrintFlow — use the marketplace’s shipping label.</p>
          ) : (
            <p className="mt-1 text-[11pt]">
              {lines.map((l, i) => (
                <span key={i} className="block">{l}</span>
              ))}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[8pt] font-semibold tracking-wider text-zinc-500 uppercase">Items</p>
          <p className="mt-1 text-[20pt] font-bold">{units}</p>
        </div>
      </div>

      <table className="mt-8 w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black text-left text-[8pt] tracking-wider text-zinc-500 uppercase">
            <th className="w-[9mm] pb-1.5 font-semibold">✓</th>
            <th className="w-[14mm] pb-1.5 font-semibold">Qty</th>
            <th className="pb-1.5 font-semibold">Item</th>
            {showPrices ? <th className="w-[28mm] pb-1.5 text-right font-semibold">Price</th> : null}
          </tr>
        </thead>
        <tbody>
          {order.order_items.map((i) => (
            <tr key={i.id} className="border-b border-zinc-300 align-top" style={{ breakInside: "avoid" }}>
              <td className="py-2.5"><span className="inline-block size-[5mm] rounded-sm border-[1.5px] border-black" /></td>
              <td className="py-2.5 text-[12pt] font-bold">{i.quantity}</td>
              <td className="py-2.5">
                <p className="font-semibold">{i.title}</p>
                {i.variant_title ? <p className="text-[9.5pt] text-zinc-600">{i.variant_title}</p> : null}
                {i.personalisation ? (
                  <p className="mt-1 rounded border border-zinc-400 px-2 py-1 text-[10pt] whitespace-pre-wrap [overflow-wrap:anywhere]">{i.personalisation}</p>
                ) : null}
              </td>
              {showPrices ? <td className="py-2.5 text-right">{money(i.total_price)}</td> : null}
            </tr>
          ))}
        </tbody>
        {showPrices ? (
          <tfoot className="text-[10pt]">
            <tr><td colSpan={3} className="pt-2 text-right text-zinc-600">Subtotal</td><td className="pt-2 text-right">{money(order.subtotal)}</td></tr>
            {order.discount_total > 0 ? <tr><td colSpan={3} className="text-right text-zinc-600">Discount</td><td className="text-right">−{money(order.discount_total)}</td></tr> : null}
            {order.shipping_total > 0 ? <tr><td colSpan={3} className="text-right text-zinc-600">Delivery</td><td className="text-right">{money(order.shipping_total)}</td></tr> : null}
            <tr className="font-bold"><td colSpan={3} className="pt-1 text-right">Total</td><td className="pt-1 text-right">{money(order.total)}</td></tr>
          </tfoot>
        ) : null}
      </table>

      <div className="mt-auto pt-10">
        {settings?.slip_message ? (
          <p className="rounded-lg border border-zinc-300 px-4 py-3 text-center text-[11pt] whitespace-pre-line">{settings.slip_message}</p>
        ) : null}
        {order.is_sample ? <p className="mt-3 text-center text-[8pt] font-semibold">SAMPLE DATA — not a real order</p> : null}
      </div>
    </section>
  );
}
