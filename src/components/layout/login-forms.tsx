"use client";

import * as React from "react";
import { useActionState } from "react";
import { ArrowRight, CircleCheck } from "lucide-react";
import { createOwnerAction, requestPasswordResetAction, signInAction } from "@/lib/actions/auth";
import { Field, FormError, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/action-result";

function fieldError(state: ActionResult | null, name: string) {
  return state && !state.ok ? state.fieldErrors?.[name] : undefined;
}

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, null);
  const [mode, setMode] = React.useState<"signin" | "reset">("signin");
  const [resetState, resetAction] = useActionState(requestPasswordResetAction, null);

  if (mode === "reset") {
    return (
      <form action={resetAction} className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Reset your password</h1>
          <p className="mt-1.5 text-sm text-muted">We’ll email you a secure link to choose a new password.</p>
        </div>
        {resetState?.ok ? (
          <div className="flex gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm text-brand-800">
            <CircleCheck className="mt-0.5 size-4 shrink-0" /> {resetState.message}
          </div>
        ) : (
          <FormError message={resetState && !resetState.ok ? resetState.error : null} />
        )}
        <Field label="Email" htmlFor="reset-email" error={fieldError(resetState, "email")}>
          <Input id="reset-email" name="email" type="email" autoComplete="email" required className="h-10" />
        </Field>
        <SubmitButton size="lg" className="w-full">Send reset link</SubmitButton>
        <button type="button" onClick={() => setMode("signin")} className="w-full text-center text-sm font-medium text-muted hover:text-ink">
          Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted">Sign in to manage orders and production.</p>
      </div>
      <FormError message={state && !state.ok && !state.fieldErrors ? state.error : null} />
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email" error={fieldError(state, "email")}>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus className="h-10" />
      </Field>
      <Field
        label={
          <span className="flex w-full items-center justify-between">
            Password
            <button type="button" onClick={() => setMode("reset")} className="text-xs font-medium text-brand-700 hover:underline">
              Forgot password?
            </button>
          </span>
        }
        htmlFor="password"
        error={fieldError(state, "password")}
      >
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10" />
      </Field>
      <SubmitButton size="lg" className="w-full">
        Sign in <ArrowRight />
      </SubmitButton>
    </form>
  );
}

export function CreateOwnerForm() {
  const [state, action] = useActionState(createOwnerAction, null);
  if (state?.ok) {
    return (
      <div className="space-y-3">
        <CircleCheck className="size-8 text-brand-600" />
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Confirm your email</h1>
        <p className="text-sm text-muted">{state.message}</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div>
        <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
          First-time setup
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-ink">Create the owner account</h1>
        <p className="mt-1.5 text-sm text-muted">
          This installation has no users yet. The first account becomes the business owner. Anyone who signs up
          afterwards must be approved by you.
        </p>
      </div>
      <FormError message={state && !state.ok && !state.fieldErrors ? state.error : null} />
      <Field label="Your name" htmlFor="fullName" error={fieldError(state, "fullName")}>
        <Input id="fullName" name="fullName" autoComplete="name" required className="h-10" />
      </Field>
      <Field label="Email" htmlFor="email" error={fieldError(state, "email")}>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-10" />
      </Field>
      <Field label="Password" htmlFor="password" error={fieldError(state, "password")} hint="At least 10 characters, including a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required className="h-10" />
      </Field>
      <SubmitButton size="lg" className="w-full">
        Create owner account <ArrowRight />
      </SubmitButton>
    </form>
  );
}
