"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2, Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { setProductImageAction } from "@/lib/actions/products";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export function ProductImageUpload({ productId, imageUrl, canEdit }: { productId: string; imageUrl: string | null; canEdit: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  const upload = async (file: File) => {
    if (!TYPES.includes(file.type)) return toast({ title: "Use a JPEG, PNG, WebP or AVIF image", tone: "error" });
    if (file.size > MAX_BYTES) return toast({ title: "Images must be 5 MB or smaller", tone: "error" });
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${productId}/${Date.now()}.${ext}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);
      const res = await setProductImageAction(productId, path);
      if (!res.ok) throw new Error(res.error);
      toast({ title: "Image updated" });
      router.refresh();
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-line bg-gradient-to-br from-zinc-50 to-zinc-100">
        {imageUrl ? (
          <Image src={imageUrl} alt="Product" fill sizes="(max-width: 1024px) 100vw, 360px" className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-faint">
            <Box className="size-10" strokeWidth={1.2} />
            <span className="text-xs">No image</span>
          </div>
        )}
      </div>
      {canEdit ? (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" className="flex-1" loading={busy} onClick={() => inputRef.current?.click()}>
            <ImagePlus /> {imageUrl ? "Replace image" : "Upload image"}
          </Button>
          {imageUrl ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove image"
              onClick={async () => {
                const res = await setProductImageAction(productId, null);
                toast(res.ok ? { title: "Image removed" } : { title: res.error, tone: "error" });
                router.refresh();
              }}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
