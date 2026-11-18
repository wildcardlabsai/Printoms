"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, CircleCheck, Ellipsis, Hand, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { cancelOrderAction, completeOrderAction, reopenOrderAction, setOrderHoldAction } from "@/lib/actions/orders";
import type { OrderStatus } from "@/lib/constants";
import type { ActionResult } from "@/lib/action-result";

export function OrderActions({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const toast = useToast();
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"hold" | "cancel" | null>(null);
  const [reason, setReason] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast({ title: res.message ?? "Done" });
        setDialog(null);
        setReason("");
        router.refresh();
      } else toast({ title: res.error, tone: "error" });
    });

  const closed = ["dispatched", "completed", "cancelled"].includes(status);

  return (
    <>
      {status === "on_hold" ? (
        <Button variant="outline" onClick={() => run(() => setOrderHoldAction(orderId, false))} loading={pending}>
          <Play /> Release hold
        </Button>
      ) : null}
      {status === "dispatched" ? (
        <Button variant="outline" onClick={() => run(() => completeOrderAction(orderId))} loading={pending}>
          <CircleCheck /> Mark completed
        </Button>
      ) : null}
      {status === "cancelled" ? (
        <Button variant="outline" onClick={() => run(() => reopenOrderAction(orderId))} loading={pending}>
          <RotateCcw /> Reopen order
        </Button>
      ) : null}
      {!closed ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More order actions">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {status !== "on_hold" ? (
              <DropdownMenuItem onSelect={() => setDialog("hold")}>
                <Hand /> Put on hold
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem destructive onSelect={() => setDialog("cancel")}>
              <Ban /> Cancel order
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent
          size="sm"
          title={dialog === "hold" ? "Put order on hold" : "Cancel order"}
          description={
            dialog === "hold"
              ? "All unfinished production jobs for this order move to On Hold until released."
              : "The order is removed from production. This does not cancel or refund it on Etsy or Shopify."
          }
        >
          <DialogBody>
            <Field label="Reason" htmlFor="reason" hint="Recorded in the order history.">
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Back</Button>
            {dialog === "hold" ? (
              <Button loading={pending} onClick={() => run(() => setOrderHoldAction(orderId, true, reason))}>Put on hold</Button>
            ) : (
              <Button variant="danger" loading={pending} onClick={() => run(() => cancelOrderAction(orderId, reason))}>
                Cancel order
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
