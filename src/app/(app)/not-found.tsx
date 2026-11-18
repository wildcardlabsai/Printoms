import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <Card>
      <EmptyState
        icon={<SearchX />}
        title="Not found"
        description="The record you’re looking for doesn’t exist or may have been removed."
        action={<ButtonLink href="/overview" variant="outline">Back to overview</ButtonLink>}
      />
    </Card>
  );
}
