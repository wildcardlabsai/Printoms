import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { BusinessSettingsForm } from "@/components/settings/business-settings-form";
import { getBusinessSettings } from "@/lib/data/settings";
import { hasRole, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await getBusinessSettings();
  return (
    <>
      <PageHeader title="Settings" description="Business configuration, marketplace connections and team access." />
      <SettingsNav active="general" isAdmin={hasRole(user, "admin")} />
      {settings ? <BusinessSettingsForm settings={settings} canEdit={hasRole(user, "admin")} /> : <p className="text-sm text-muted">Business settings are missing — re-run the database migrations.</p>}
    </>
  );
}
