import { TabNav } from "@/components/ui/misc";

const TABS = [
  { id: "general", label: "General", href: "/settings" },
  { id: "integrations", label: "Integrations", href: "/settings/integrations" },
  { id: "team", label: "Team", href: "/settings/team" },
  { id: "data", label: "Data", href: "/settings/data" },
  { id: "profile", label: "Profile", href: "/settings/profile" },
];

export function SettingsNav({ active }: { active: string }) {
  return <TabNav tabs={TABS} active={active} className="mb-6" />;
}
