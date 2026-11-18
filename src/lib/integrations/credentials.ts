import "server-only";
import type { AdminSupabase } from "@/lib/supabase/admin";
import type { IntegrationProvider } from "@/lib/constants";
import { decryptSecret, encryptSecret } from "./crypto";

export type StoredCredentials = {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
};

export async function getIntegration(admin: AdminSupabase, provider: IntegrationProvider) {
  const { data, error } = await admin.from("integrations").select("*").eq("provider", provider).single();
  if (error) throw new Error(error.message);
  return data;
}

export type IntegrationRow = Awaited<ReturnType<typeof getIntegration>>;

export async function loadCredentials(admin: AdminSupabase, integrationId: string): Promise<StoredCredentials | null> {
  const { data } = await admin.from("integration_credentials").select("*").eq("integration_id", integrationId).maybeSingle();
  if (!data) return null;
  return {
    accessToken: data.access_token_encrypted ? decryptSecret(data.access_token_encrypted) : null,
    refreshToken: data.refresh_token_encrypted ? decryptSecret(data.refresh_token_encrypted) : null,
    accessTokenExpiresAt: data.access_token_expires_at ? new Date(data.access_token_expires_at) : null,
  };
}

export async function saveCredentials(
  admin: AdminSupabase,
  integrationId: string,
  creds: { accessToken: string; refreshToken?: string | null; expiresInSeconds?: number | null; refreshExpiresInDays?: number | null },
) {
  const { error } = await admin.from("integration_credentials").upsert(
    {
      integration_id: integrationId,
      access_token_encrypted: encryptSecret(creds.accessToken),
      refresh_token_encrypted: creds.refreshToken ? encryptSecret(creds.refreshToken) : null,
      access_token_expires_at: creds.expiresInSeconds ? new Date(Date.now() + creds.expiresInSeconds * 1000).toISOString() : null,
      refresh_token_expires_at: creds.refreshExpiresInDays
        ? new Date(Date.now() + creds.refreshExpiresInDays * 86_400_000).toISOString()
        : null,
    },
    { onConflict: "integration_id" },
  );
  if (error) throw new Error(`Could not store credentials: ${error.message}`);
}

export async function deleteCredentials(admin: AdminSupabase, integrationId: string) {
  await admin.from("integration_credentials").delete().eq("integration_id", integrationId);
}
