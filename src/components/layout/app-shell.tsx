"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronRight, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_NAV_ITEMS, MOBILE_TABS, NAV_GROUPS, SEGMENT_LABELS, type NavCounts, type NavItem } from "./nav-config";
import { GlobalSearch } from "./global-search";
import { NotificationsMenu, type AppNotification } from "./notifications-menu";
import { UserMenu } from "./user-menu";
import type { CurrentUser } from "@/lib/auth";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/overview" className="flex items-center gap-2.5 px-1" aria-label="PrintFlow home">
      <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-gradient-to-br from-brand-500 to-brand-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.2)]">
        <svg viewBox="0 0 24 24" className="size-[18px] text-white" fill="none" aria-hidden>
          <path d="M5 7.5 12 4l7 3.5-7 3.5-7-3.5Z" fill="currentColor" opacity=".95" />
          <path d="M5 12l7 3.5 7-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity=".75" />
          <path d="M5 16.5 12 20l7-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity=".5" />
        </svg>
      </span>
      {!collapsed ? (
        <span className="text-[17px] font-semibold tracking-[-0.03em] text-ink">
          Print<span className="text-brand-600">Flow</span>
        </span>
      ) : null}
    </Link>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  count,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
  count?: number;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
        active ? "bg-white text-ink shadow-card ring-1 ring-line" : "text-ink-2/80 hover:bg-zinc-200/50 hover:text-ink",
        collapsed && "justify-center px-0",
      )}
    >
      {active ? <span className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-brand-500" aria-hidden /> : null}
      <Icon className={cn("size-[18px] shrink-0", active ? "text-brand-600" : "text-muted group-hover:text-ink-2")} />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
      {count ? (
        <span
          className={cn(
            "tabular rounded-full text-[11px] font-semibold",
            collapsed
              ? "absolute -top-0.5 right-0.5 flex size-4 items-center justify-center bg-brand-600 text-[9px] text-white"
              : "ml-auto bg-zinc-200/70 px-1.5 py-px text-ink-2",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarNav({
  pathname,
  collapsed,
  counts,
  onNavigate,
}: {
  pathname: string;
  collapsed?: boolean;
  counts: NavCounts;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-5" aria-label="Main">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          {!collapsed ? (
            <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{group.label}</p>
          ) : (
            <div className="mx-auto mb-2 h-px w-6 bg-line" />
          )}
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.key}
                item={item}
                collapsed={collapsed}
                active={isActive(pathname, item.href)}
                count={counts[item.key]}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Breadcrumbs({ pathname }: { pathname: string }) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = SEGMENT_LABELS[seg] ?? (/^[0-9a-f-]{36}$/i.test(seg) ? "Details" : decodeURIComponent(seg));
    return { href, label };
  });
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[13px] md:flex">
      {crumbs.map((c, i) => (
        <React.Fragment key={c.href}>
          {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-faint" /> : null}
          {i === crumbs.length - 1 ? (
            <span className="truncate font-medium text-ink">{c.label}</span>
          ) : (
            <Link href={c.href} className="truncate text-muted transition hover:text-ink">
              {c.label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function AppShell({
  user,
  counts,
  notifications,
  initialCollapsed,
  businessName,
  children,
}: {
  user: CurrentUser;
  counts: NavCounts;
  notifications: AppNotification[];
  initialCollapsed: boolean;
  businessName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `pf_sidebar=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  };

  const currentSection = ALL_NAV_ITEMS.find((i) => isActive(pathname, i.href));

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-[#f3f4f6]/80 backdrop-blur-xl transition-[width] duration-200 lg:flex",
          collapsed ? "w-[72px]" : "w-[260px]",
        )}
      >
        <div className={cn("flex h-16 items-center", collapsed ? "justify-center px-2" : "px-5")}>
          <Logo collapsed={collapsed} />
        </div>
        <div className={cn("scrollbar-thin flex-1 overflow-y-auto pb-4", collapsed ? "px-3" : "px-4")}>
          <SidebarNav pathname={pathname} collapsed={collapsed} counts={counts} />
        </div>
        <div className={cn("border-t border-line p-3", collapsed && "flex justify-center")}>
          {!collapsed ? (
            <div className="mb-2 truncate px-2 text-[11px] font-medium text-faint" title={businessName}>
              {businessName}
            </div>
          ) : null}
          <button
            onClick={toggleCollapsed}
            className={cn(
              "flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-muted transition hover:bg-zinc-200/60 hover:text-ink",
              !collapsed && "w-full",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed ? "Collapse" : null}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-[300px] flex-col bg-[#f5f6f8] shadow-overlay outline-none data-[state=open]:animate-slide-in-left lg:hidden">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Main application navigation</DialogPrimitive.Description>
            <div className="flex h-16 items-center justify-between px-5">
              <Logo />
              <DialogPrimitive.Close className="rounded-lg p-2 text-muted hover:bg-zinc-200/60" aria-label="Close menu">
                <X className="size-5" />
              </DialogPrimitive.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-6">
              <SidebarNav pathname={pathname} counts={counts} onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="safe-bottom border-t border-line px-5 py-3 text-xs text-faint">{businessName}</div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className={cn("flex min-h-dvh flex-col transition-[padding] duration-200", collapsed ? "lg:pl-[72px]" : "lg:pl-[260px]")}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-line bg-white/80 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-5 lg:h-16 lg:px-8">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-ink-2 hover:bg-zinc-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0 lg:hidden">
              <p className="truncate text-[15px] font-semibold text-ink">{currentSection?.label ?? "PrintFlow"}</p>
            </div>
            <Breadcrumbs pathname={pathname} />
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <GlobalSearch />
              <NotificationsMenu notifications={notifications} />
              <UserMenu user={user} />
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-7 lg:pb-12">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/90 backdrop-blur-xl lg:hidden"
        aria-label="Quick navigation"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {MOBILE_TABS.map((key) => {
            const item = ALL_NAV_ITEMS.find((i) => i.key === key)!;
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            const count = counts[key];
            return (
              <Link
                key={key}
                href={item.href}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10.5px] font-medium transition-colors",
                  active ? "text-brand-700" : "text-muted",
                )}
              >
                <span className="relative">
                  <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                  {count ? (
                    <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">
                      {count > 99 ? "99+" : count}
                    </span>
                  ) : null}
                </span>
                {item.mobileLabel ?? item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
