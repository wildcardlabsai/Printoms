"use client";

import * as React from "react";
import { StickyNote, Trash2 } from "lucide-react";
import { addNoteAction, deleteNoteAction } from "@/lib/actions/notes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Avatar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatRelative } from "@/lib/utils";
import type { NoteRow } from "@/lib/data/orders";

export function NotesPanel({
  entityType,
  entityId,
  notes,
  currentUserId,
  canWrite,
  revalidate,
}: {
  entityType: "order" | "customer" | "product" | "production_job" | "printer";
  entityId: string;
  notes: NoteRow[];
  currentUserId: string;
  canWrite: boolean;
  revalidate: string;
}) {
  const toast = useToast();
  const [body, setBody] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const submit = () => {
    startTransition(async () => {
      const res = await addNoteAction({ entity_type: entityType, entity_id: entityId, body }, revalidate);
      if (res.ok) setBody("");
      else toast({ title: res.error, tone: "error" });
    });
  };

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add an internal note — only your team can see this"
            rows={2}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && body.trim()) submit();
            }}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={!body.trim()} loading={pending}>
              Add note
            </Button>
          </div>
        </div>
      ) : null}
      {notes.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-4 text-[13px] text-muted">
          <StickyNote className="size-4" /> No internal notes yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => {
            const author = n.author?.full_name || n.author?.email || "Former user";
            return (
              <li key={n.id} className="group flex gap-3">
                <Avatar name={author} className="size-7 text-[10px]" />
                <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm bg-subtle px-3 py-2 ring-1 ring-line">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-ink">{author}</span>
                    <span className="text-faint">{formatRelative(n.created_at)}</span>
                    {canWrite && n.author_id === currentUserId ? (
                      <button
                        className="ml-auto rounded p-0.5 text-faint opacity-0 transition group-hover:opacity-100 hover:text-red-600 focus:opacity-100"
                        aria-label="Delete note"
                        onClick={() =>
                          startTransition(async () => {
                            const res = await deleteNoteAction(n.id, revalidate);
                            if (!res.ok) toast({ title: res.error, tone: "error" });
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">{n.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
