"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { deleteProductAction } from "@/lib/actions/products";

export function DeleteProductButton({ id, hasOrders }: { id: string; hasOrders: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const toast = useToast();
  const router = useRouter();
  if (hasOrders) return null;
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Trash2 /> Delete
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm" title="Delete this product?" description="This product has no orders. Its listings, notes and image will be removed.">
          <DialogBody><p className="text-sm text-ink-2">This cannot be undone. To hide a product but keep it, untick “Active in catalogue” instead.</p></DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await deleteProductAction(id);
                  if (res.ok) {
                    toast({ title: "Product deleted" });
                    router.push("/products");
                  } else toast({ title: res.error, tone: "error" });
                })
              }
            >
              Delete product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
