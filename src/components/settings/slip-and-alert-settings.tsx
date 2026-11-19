"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BellRing, FileText, ImagePlus, Mail, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, FormError, Input, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { sendTestAlertAction, setBrandLogoAction, updateAlertSettingsAction, updateSlipSettingsAction } from "@/lib/actions/settings";
import type { BusinessSettings } from "@/lib/data/settings";
import { formatDateTime } from "@/lib/utils";

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export function SlipAndAlertSettings({
  settings,
  logoUrl,
  canEdit,
  emailConfigured,
}: {
  settings: BusinessSettings;
  logoUrl: string | null;
  canEdit: boolean;
  emailConfigured: boolean;
}) {
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <SlipSettings settings={settings} logoUrl={logoUrl} canEdit={canEdit} />
      <AlertSettings settings={settings} canEdit={canEdit} emailConfigured={emailConfigured} />
    </div>
  );
}

function SlipSettings({ settings, logoUrl, canEdit }: { settings: BusinessSettings; logoUrl: string | null; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = React.useState({
    return_address: settings.return_address ?? "",
    contact_email: settings.contact_email ?? "",
    slip_message: settings.slip_message ?? "",
    slip_show_prices: settings.slip_show_prices ?? false,
  });
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const save = () =>
    startTransition(async () => {
      setError(null);
      const res = await updateSlipSettingsAction(values);
      if (!res.ok) {
        setError(res.error);
        setErrors(res.fieldErrors ?? {});
        return;
      }
      setErrors({});
      toast({ title: res.message ?? "Saved" });
      router.refresh();
    });

  const uploadLogo = async (file: File) => {
    const ext = LOGO_TYPES[file.type];
    if (!ext) return toast({ title: "Use a PNG, JPEG or WebP image", tone: "error" });
    if (file.size > 2 * 1024 * 1024) return toast({ title: "Logos must be 2 MB or smaller", tone: "error" });
    setUploading(true);
    try {
      const path = `branding/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await createClient().storage.from("product-images").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);
      const res = await setBrandLogoAction(path);
      if (!res.ok) throw new Error(res.error);
      toast({ title: "Logo updated" });
      router.refresh();
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader icon={<FileText />} title="Packing slips" description="Printed from Packing & Dispatch and the order page (A4)." />
      <CardContent className="space-y-3">
        <FormError message={error} />
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-32 items-center justify-center overflow-hidden rounded-lg border border-line bg-subtle">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-xs text-faint">No logo</span>
            )}
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
              <Button size="sm" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
                <ImagePlus /> {logoUrl ? "Replace logo" : "Upload logo"}
              </Button>
              {logoUrl ? (
                <Button size="sm" variant="ghost" onClick={() => startTransition(async () => { await setBrandLogoAction(null); router.refresh(); })}>
                  <Trash2 /> Remove
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <Field label="Return address" htmlFor="return_address" error={errors.return_address?.[0]} hint="Printed under your business name.">
          <Textarea id="return_address" rows={3} disabled={!canEdit} value={values.return_address} onChange={(e) => setValues({ ...values, return_address: e.target.value })} />
        </Field>
        <Field label="Contact email on slips" htmlFor="contact_email" error={errors.contact_email?.[0]}>
          <Input id="contact_email" type="email" disabled={!canEdit} value={values.contact_email} onChange={(e) => setValues({ ...values, contact_email: e.target.value })} />
        </Field>
        <Field label="Thank-you message" htmlFor="slip_message" error={errors.slip_message?.[0]} hint="Leave empty for no message.">
          <Textarea id="slip_message" rows={3} disabled={!canEdit} value={values.slip_message} onChange={(e) => setValues({ ...values, slip_message: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <Checkbox checked={values.slip_show_prices} disabled={!canEdit} onChange={(e) => setValues({ ...values, slip_show_prices: e.target.checked })} />
          Show prices on packing slips (off is best for gifts)
        </label>
      </CardContent>
      {canEdit ? (
        <CardFooter>
          <Button onClick={save} loading={pending}>Save packing slips</Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

function AlertSettings({ settings, canEdit, emailConfigured }: { settings: BusinessSettings; canEdit: boolean; emailConfigured: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [enabled, setEnabled] = React.useState(settings.new_order_alerts_enabled ?? false);
  const [email, setEmail] = React.useState(settings.new_order_alert_email ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | undefined>();
  const [pending, startTransition] = React.useTransition();
  const [testing, setTesting] = React.useState(false);

  const save = () =>
    startTransition(async () => {
      setError(null);
      const res = await updateAlertSettingsAction({ new_order_alerts_enabled: enabled, new_order_alert_email: email });
      if (!res.ok) {
        setError(res.error);
        setFieldError(res.fieldErrors?.new_order_alert_email?.[0]);
        return;
      }
      setFieldError(undefined);
      toast({ title: res.message ?? "Saved" });
      router.refresh();
    });

  const test = async () => {
    setTesting(true);
    const res = await sendTestAlertAction();
    setTesting(false);
    toast(res.ok ? { title: res.message ?? "Sent" } : { title: "Test email failed", description: res.error, tone: "error" });
  };

  return (
    <Card>
      <CardHeader icon={<BellRing />} title="New-order emails" description="An email for each new marketplace order, sent after each sync." />
      <CardContent className="space-y-3">
        {!emailConfigured ? (
          <Notice tone="warning" icon={<Mail />} title="Email sending isn’t set up">
            Add <code className="rounded bg-subtle px-1 text-xs">RESEND_API_KEY</code> in Vercel and redeploy. Until then no emails are sent.
          </Notice>
        ) : null}
        <FormError message={error} />
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <Checkbox checked={enabled} disabled={!canEdit} onChange={(e) => setEnabled(e.target.checked)} />
          Email me when a new order arrives
        </label>
        <Field label="Send alerts to" htmlFor="alert_email" error={fieldError}>
          <Input id="alert_email" type="email" placeholder="you@example.com" disabled={!canEdit} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
          <li>Etsy, Shopify and Vinted orders only — not sample or manual orders.</li>
          <li>Only orders that arrive after you switch this on, placed in the last 3 days — importing old history never floods your inbox.</li>
          <li>Each order is emailed once. Several new orders in one sync arrive as one email.</li>
        </ul>
        {settings.new_order_alerts_enabled && settings.new_order_alerts_since ? (
          <p className="text-xs text-ink-2">On since {formatDateTime(settings.new_order_alerts_since)}.</p>
        ) : null}
      </CardContent>
      {canEdit ? (
        <CardFooter className="flex flex-wrap gap-2">
          <Button onClick={save} loading={pending}>Save alerts</Button>
          <Button variant="outline" onClick={test} loading={testing} disabled={!emailConfigured || !settings.new_order_alert_email}>
            <Mail /> Send test email
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
