import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";
import { getShellData } from "@/lib/data/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [shell, cookieStore] = await Promise.all([getShellData(user), cookies()]);
  const collapsed = cookieStore.get("pf_sidebar")?.value === "collapsed";

  return (
    <AppShell
      user={user}
      counts={shell.counts}
      notifications={shell.notifications}
      initialCollapsed={collapsed}
      businessName={shell.businessName}
    >
      {children}
    </AppShell>
  );
}
