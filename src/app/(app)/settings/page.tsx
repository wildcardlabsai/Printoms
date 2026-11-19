import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { BusinessSettingsForm } from "@/components/settings/business-settings-form";
import { getBusinessSettings } from "@/lib/data/settings";
import { signedImageUrls } from "@/lib/data/products";
import { SlipAndAlertSettings } from "@/components/settings/slip-and-alert-settings";
import { serverEnv } from "@/lib/server-env";
import { hasRole, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await getBusinessSettings();
  const logoUrl = settings?.logo_path ? ((await signedImageUrls([settings.logo_path]))[settings.logo_path] ?? null) : null;
  return (
    <>
      <PageHeader title="Settings" description="Business configuration, marketplace connections and team access." />
      <SettingsNav active="general" isAdmin={hasRole(user, "admin")} />
      {settings ? (
        <>
          <BusinessSettingsForm settings={settings} canEdit={hasRole(user, "admin")} />
          <SlipAndAlertSettings settings={settings} logoUrl={logoUrl} canEdit={hasRole(user, "admin")} emailConfigured={Boolean(serverEnv.email.resendApiKey)} />
        </>
      ) : (
        <p className="text-sm text-muted">Business settings are missing — re-run the database migrations.</p>
      )}
    </>
  );
}
