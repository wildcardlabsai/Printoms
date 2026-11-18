import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ProfileForms } from "@/components/settings/profile-forms";
import { hasRole, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Profile · Settings" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const user = await requireUser();
  const { reset } = await searchParams;
  return (
    <>
      <PageHeader title="Settings" description="Business configuration, marketplace connections and team access." />
      <SettingsNav active="profile" isAdmin={hasRole(user, "admin")} />
      <ProfileForms fullName={user.fullName ?? ""} email={user.email} reset={Boolean(reset)} />
    </>
  );
}
