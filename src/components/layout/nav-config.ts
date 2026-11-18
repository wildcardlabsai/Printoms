import {
  Boxes,
  ChartColumn,
  Disc3,
  LayoutDashboard,
  PackageCheck,
  Printer,
  Settings,
  ShoppingBag,
  SquareKanban,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavKey =
  | "overview"
  | "orders"
  | "production"
  | "printers"
  | "fulfilment"
  | "products"
  | "filament"
  | "customers"
  | "analytics"
  | "settings";

export type NavItem = { key: NavKey; label: string; href: string; icon: LucideIcon; mobileLabel?: string };

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Operations",
    items: [
      { key: "overview", label: "Overview", href: "/overview", icon: LayoutDashboard },
      { key: "orders", label: "All Orders", href: "/orders", icon: ShoppingBag, mobileLabel: "Orders" },
      { key: "production", label: "Production Board", href: "/production", icon: SquareKanban, mobileLabel: "Board" },
      { key: "printers", label: "Print Farm", href: "/printers", icon: Printer, mobileLabel: "Printers" },
      { key: "fulfilment", label: "Packing & Dispatch", href: "/fulfilment", icon: PackageCheck, mobileLabel: "Dispatch" },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { key: "products", label: "Products", href: "/products", icon: Boxes },
      { key: "filament", label: "Filament Inventory", href: "/filament", icon: Disc3 },
      { key: "customers", label: "Customers", href: "/customers", icon: Users },
    ],
  },
  {
    label: "Insights",
    items: [
      { key: "analytics", label: "Analytics", href: "/analytics", icon: ChartColumn },
      { key: "settings", label: "Settings & Integrations", href: "/settings", icon: Settings, mobileLabel: "Settings" },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
export const MOBILE_TABS: NavKey[] = ["overview", "orders", "production", "printers", "fulfilment"];

export const SEGMENT_LABELS: Record<string, string> = {
  overview: "Overview",
  orders: "All Orders",
  production: "Production Board",
  printers: "Print Farm",
  fulfilment: "Packing & Dispatch",
  products: "Products",
  filament: "Filament Inventory",
  customers: "Customers",
  analytics: "Analytics",
  settings: "Settings",
  integrations: "Integrations",
  team: "Team",
  data: "Data",
  new: "New",
  edit: "Edit",
  search: "Search",
  history: "History",
};

export type NavCounts = Partial<Record<NavKey, number>>;
