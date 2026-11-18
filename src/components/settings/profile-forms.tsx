"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FormError, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import { updateProfileAction } from "@/lib/actions/settings";
import { updatePasswordAction } from "@/lib/actions/auth";

export function ProfileForms({ fullName, email, reset }: { fullName: string; email: string; reset?: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = React.useState(fullName);
  const [pending, startTransition] = React.useTransition();
  const [pwState, pwAction] = useActionState(updatePasswordAction, null);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (pwState?.ok) {
      toast({ title: "Password updated" });
      formRef.current?.reset();
    }
  }, [pwState, toast]);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Profile" />
        <CardContent className="space-y-3">
          <Field label="Name" htmlFor="pf-name">
            <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="pf-email" hint="Contact an owner to change the sign-in email.">
            <Input id="pf-email" value={email} disabled />
          </Field>
          <Button
            disabled={name.trim() === fullName || !name.trim()}
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await updateProfileAction(name);
                toast(res.ok ? { title: res.message ?? "Saved" } : { title: res.error, tone: "error" });
                if (res.ok) router.refresh();
              })
            }
          >
            Save profile
          </Button>
        </CardContent>
      </Card>
      <Card className={reset ? "ring-2 ring-brand-500/40" : undefined}>
        <CardHeader title={reset ? "Choose a new password" : "Change password"} />
        <CardContent>
          <form ref={formRef} action={pwAction} className="space-y-3">
            <FormError message={pwState && !pwState.ok && !pwState.fieldErrors ? pwState.error : null} />
            <Field label="New password" htmlFor="password" error={pwState && !pwState.ok ? pwState.fieldErrors?.password : undefined} hint="At least 10 characters, including a letter and a number.">
              <Input id="password" name="password" type="password" autoComplete="new-password" required />
            </Field>
            <Field label="Confirm password" htmlFor="confirm" error={pwState && !pwState.ok ? pwState.fieldErrors?.confirm : undefined}>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
            </Field>
            <SubmitButton>Update password</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
