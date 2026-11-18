import type { Metadata } from "next";
import { Info, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/misc";
import { SettingsNav } from "@/components/settings/settings-nav";
import { TeamTable } from "@/components/settings/team-table";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Team · Settings" };

export default async function TeamPage() {
  const user = await requireUser("admin");
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active, created_at")
    .order("is_active")
    .order("created_at");

  return (
    <>
      <PageHeader title="Settings" description="Business configuration, marketplace connections and team access." />
      <SettingsNav active="team" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <CardHeader icon={<Users />} title="Team members" description="Approve new sign-ups and set roles." />
          <div className="border-t border-line">
            <TeamTable members={members ?? []} currentUserId={user.id} currentRole={user.role} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Roles" />
          <CardContent className="space-y-3 text-sm text-ink-2">
            <p><strong className="text-ink">Viewer</strong> — read-only access to all modules.</p>
            <p><strong className="text-ink">Staff</strong> — manage orders, production, printers, packing, products and stock.</p>
            <p><strong className="text-ink">Admin</strong> — plus settings, integrations, team approval and deleting records.</p>
            <p><strong className="text-ink">Owner</strong> — full control, including granting the owner role.</p>
            <Notice tone="neutral" icon={<Info />}>
              New accounts can’t see any data until approved. For a private installation, disable public sign-ups in Supabase (Authentication → Providers → Email) once your team has joined.
            </Notice>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
