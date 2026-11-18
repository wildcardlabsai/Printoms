import { TabNav } from "@/components/ui/misc";

const TABS = [
  { id: "general", label: "General", href: "/settings" },
  { id: "integrations", label: "Integrations", href: "/settings/integrations" },
  { id: "team", label: "Team", href: "/settings/team", adminOnly: true },
  { id: "data", label: "Data", href: "/settings/data", adminOnly: true },
  { id: "profile", label: "Profile", href: "/settings/profile" },
];

export function SettingsNav({ active, isAdmin = true }: { active: string; isAdmin?: boolean }) {
  return <TabNav tabs={TABS.filter((t) => isAdmin || !t.adminOnly)} active={active} className="mb-6" />;
}
