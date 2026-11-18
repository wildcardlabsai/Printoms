import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Avatar } from "@/components/ui/misc";
import { SampleBadge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/status-badges";
import { CustomerFilters } from "./customer-filters";
import { CUSTOMER_SORTS, listCustomers } from "@/lib/data/customers";
import { requireUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { OrderSource } from "@/lib/constants";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const sort = (sp.sort && sp.sort in CUSTOMER_SORTS ? sp.sort : "recent") as keyof typeof CUSTOMER_SORTS;
  const result = await listCustomers({ q: sp.q, source: sp.source, sort, page: Math.max(1, Number(sp.page) || 1) });
  const href = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") p.set(k, v);
    if (page > 1) p.set("page", String(page));
    return `/customers${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Customers"
        description="One record per buyer across Etsy, Shopify and manual sales. Records are matched by marketplace ID or email — never by name alone."
      />
      <div className="mb-4"><CustomerFilters /></div>
      <Card className="overflow-hidden">
        {result.rows.length === 0 ? (
          <EmptyState icon={<Users />} title={sp.q || sp.source ? "No customers match" : "No customers yet"} description="Customers are created automatically from imported and manual orders." />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2.5 pr-3 pl-5 font-medium">Customer</th>
                    <th className="px-3 py-2.5 font-medium">Channels</th>
                    <th className="px-3 py-2.5 text-right font-medium">Orders</th>
                    <th className="px-3 py-2.5 text-right font-medium">Total spend</th>
                    <th className="py-2.5 pr-5 pl-3 font-medium">Last order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {result.rows.map((c) => (
                    <tr key={c.id} className="relative hover:bg-subtle">
                      <td className="py-3 pr-3 pl-5">
                        <div className="flex items-center gap-3">
                          <Avatar name={c.display_name} className="size-8 from-zinc-400 to-zinc-600" />
                          <div className="min-w-0">
                            <Link href={`/customers/${c.id}`} className="flex items-center gap-2 font-medium text-ink after:absolute after:inset-0">
                              {c.display_name} {c.is_sample ? <SampleBadge /> : null}
                            </Link>
                            <p className="truncate text-xs text-muted">{c.email ?? "No email"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">{(c.sources ?? []).map((s) => <SourceBadge key={s} source={s as OrderSource} compact />)}</div>
                      </td>
                      <td className="px-3 py-3 text-right tabular">{c.order_count}</td>
                      <td className="px-3 py-3 text-right font-medium tabular">{formatCurrency(c.total_spend, c.currency ?? "GBP")}</td>
                      <td className="py-3 pr-5 pl-3 text-ink-2">{formatDate(c.last_order_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {result.rows.map((c) => (
                <li key={c.id}>
                  <Link href={`/customers/${c.id}`} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={c.display_name} className="from-zinc-400 to-zinc-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{c.display_name}</p>
                      <p className="truncate text-xs text-muted">{c.order_count} orders · {formatCurrency(c.total_spend, c.currency ?? "GBP")}</p>
                    </div>
                    <ChevronRight className="size-4 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-4 py-3 sm:px-5">
              <Pagination page={result.page} pageSize={result.pageSize} total={result.total} hrefFor={href} />
            </div>
          </>
        )}
      </Card>
    </>
  );
}
