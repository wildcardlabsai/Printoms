"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { updateMemberAction } from "@/lib/actions/settings";
import { ROLE_LABEL, type UserRole } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

type Member = { id: string; email: string; full_name: string | null; role: UserRole; is_active: boolean; created_at: string };

export function TeamTable({ members, currentUserId, currentRole }: { members: Member[]; currentUserId: string; currentRole: UserRole }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const update = (id: string, input: { role?: string; is_active?: boolean }) =>
    startTransition(async () => {
      const res = await updateMemberAction(id, input);
      toast(res.ok ? { title: res.message ?? "Updated" } : { title: res.error, tone: "error" });
      router.refresh();
    });
  const roles: UserRole[] = currentRole === "owner" ? ["owner", "admin", "staff", "viewer"] : ["admin", "staff", "viewer"];

  return (
    <ul className="divide-y divide-line">
      {members.map((m) => {
        const self = m.id === currentUserId;
        return (
          <li key={m.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={m.full_name || m.email} />
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-sm font-medium text-ink">
                  {m.full_name || m.email} {self ? <Badge size="sm">You</Badge> : null}
                  {!m.is_active ? <Badge tone="amber" size="sm">Awaiting approval</Badge> : null}
                </p>
                <p className="truncate text-xs text-muted">{m.email} · joined {formatDate(m.created_at)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={m.role}
                disabled={self || pending || (m.role === "owner" && currentRole !== "owner")}
                onChange={(e) => update(m.id, { role: e.target.value })}
                aria-label={`Role for ${m.email}`}
                className="w-32"
              >
                {(roles.includes(m.role) ? roles : [m.role, ...roles]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </Select>
              {!self ? (
                m.is_active ? (
                  <Button variant="danger-outline" size="sm" onClick={() => update(m.id, { is_active: false })} disabled={pending}>
                    Revoke
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => update(m.id, { is_active: true })} disabled={pending}>
                    Approve
                  </Button>
                )
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
