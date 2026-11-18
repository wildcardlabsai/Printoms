import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Database } from "lucide-react";
import { AuthFrame } from "@/components/layout/auth-frame";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Configuration required" };

export default function SetupRequiredPage() {
  if (isSupabaseConfigured()) redirect("/login");
  return (
    <AuthFrame>
      <div className="space-y-5">
        <div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-200">
          <Database className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Connect your database</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            PrintFlow stores everything in your own Supabase project. Add these environment variables, apply the
            migrations, then restart the app.
          </p>
        </div>
        <ol className="space-y-3 text-sm text-ink-2">
          <li className="rounded-lg border border-line bg-subtle p-3">
            <p className="font-medium text-ink">1. Environment variables</p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-ink p-3 font-mono text-[12px] leading-relaxed text-zinc-100">
{`NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
TOKEN_ENCRYPTION_KEY=`}
            </pre>
          </li>
          <li className="rounded-lg border border-line bg-subtle p-3">
            <p className="font-medium text-ink">2. Apply migrations</p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-ink p-3 font-mono text-[12px] text-zinc-100">npx supabase db push</pre>
          </li>
          <li className="rounded-lg border border-line bg-subtle p-3">
            <p className="font-medium text-ink">3. Restart & create the owner account</p>
            <p className="mt-1 text-muted">See README.md for the full walkthrough.</p>
          </li>
        </ol>
      </div>
    </AuthFrame>
  );
}
