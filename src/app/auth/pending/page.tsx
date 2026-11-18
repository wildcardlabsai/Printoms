import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { AuthFrame } from "@/components/layout/auth-frame";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Awaiting approval" };

export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.isActive) redirect("/overview");
  return (
    <AuthFrame>
      <div className="space-y-4">
        <div className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
          <Clock className="size-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Awaiting approval</h1>
        <p className="text-sm leading-relaxed text-muted">
          You’re signed in as <span className="font-medium text-ink">{user.email}</span>, but an owner or admin needs to
          approve your account before you can access business data. Ask them to open{" "}
          <span className="font-medium text-ink">Settings → Team</span>.
        </p>
        <form action="/auth/signout" method="post">
          <button className="text-sm font-medium text-brand-700 hover:underline">Sign out</button>
        </form>
      </div>
    </AuthFrame>
  );
}
