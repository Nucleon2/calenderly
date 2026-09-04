"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">Something went wrong</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          An unexpected error occurred while loading this page. You can try again.
        </p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
