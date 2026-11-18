import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { IntegrationProvider } from "@/lib/constants";
import { getIntegration } from "./credentials";
import { createAdapter } from "./registry";
import { IntegrationError } from "./types";

/**
 * Send tracking details for a dispatched shipment back to Etsy/Shopify.
 * Records the outcome on the shipment so failures are visible and retryable.
 */
export async function pushShipmentToMarketplace(shipmentId: string) {
  const admin = createAdminClient();
  const { data: shipment, error } = await admin
    .from("shipments")
    .select("id, carrier, tracking_number, tracking_url, status, order:orders(id, source, external_order_id)")
    .eq("id", shipmentId)
    .single();
  if (error || !shipment?.order) throw new IntegrationError("Shipment not found");
  if (shipment.status !== "dispatched") throw new IntegrationError("Only dispatched shipments can be sent to the marketplace.");
  if (shipment.order.source === "manual" || !shipment.order.external_order_id) {
    throw new IntegrationError("Manual orders have no marketplace to update.");
  }
  const provider = shipment.order.source as IntegrationProvider;
  const integration = await getIntegration(admin, provider);
  if (integration.status !== "connected" && integration.status !== "error") {
    throw new IntegrationError(`${provider === "etsy" ? "Etsy" : "Shopify"} is not connected.`);
  }

  try {
    const adapter = await createAdapter(admin, integration);
    const result = await adapter.pushFulfilment({
      externalOrderId: shipment.order.external_order_id,
      carrier: shipment.carrier,
      trackingNumber: shipment.tracking_number,
      trackingUrl: shipment.tracking_url,
    });
    await admin
      .from("shipments")
      .update({
        marketplace_push_status: "sent",
        marketplace_pushed_at: new Date().toISOString(),
        marketplace_push_error: null,
        external_fulfilment_id: result.externalId,
      })
      .eq("id", shipment.id);
    await admin.from("activity_log").insert({
      entity_type: "order",
      entity_id: shipment.order.id,
      order_id: shipment.order.id,
      action: "fulfilment.pushed",
      message: `Tracking sent to ${provider === "etsy" ? "Etsy" : "Shopify"}`,
      actor_label: "Marketplace update",
    });
    return { ok: true as const };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("shipments").update({ marketplace_push_status: "failed", marketplace_push_error: message }).eq("id", shipment.id);
    throw e;
  }
}
