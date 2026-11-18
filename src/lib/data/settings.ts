import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getBusinessSettings = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("business_settings").select("*").maybeSingle();
  return data;
});

export type BusinessSettings = NonNullable<Awaited<ReturnType<typeof getBusinessSettings>>>;
