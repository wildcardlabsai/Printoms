import type { Metadata } from "next";
import { AuthFrame } from "@/components/layout/auth-frame";
import { CreateOwnerForm, SignInForm } from "@/components/layout/login-forms";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const supabase = await createClient();
  const { data: setupRequired, error: rpcError } = await supabase.rpc("setup_required");

  return (
    <AuthFrame>
      {rpcError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Database not ready</p>
          <p className="mt-1">
            PrintFlow could not reach its database schema. Apply the Supabase migrations (see README → Database) and
            reload this page.
          </p>
        </div>
      ) : setupRequired ? (
        <CreateOwnerForm />
      ) : (
        <>
          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              That sign-in link is invalid or has expired. Please try again.
            </div>
          ) : null}
          <SignInForm next={next} />
        </>
      )}
    </AuthFrame>
  );
}
