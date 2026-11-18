"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Card>
      <EmptyState
        icon={<TriangleAlert />}
        title="This page couldn’t be loaded"
        description={
          error.digest
            ? `Something went wrong while loading data. Reference: ${error.digest}`
            : "Something went wrong while loading data. Please try again."
        }
        action={<Button onClick={reset}>Try again</Button>}
      />
    </Card>
  );
}
