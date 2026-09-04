"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

export interface CancelFormProps {
  onCancel: (reason: string) => Promise<{ ok: boolean; error?: string }>;
}

/** Optional-reason + confirm button. On success the caller redirects, so there's no local "cancelled" state to manage here. */
export function CancelForm({ onCancel }: CancelFormProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setSubmitting(true);
    setError(null);
    const result = await onCancel(reason.trim());
    if (!result.ok) {
      setError(result.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="cancel-reason">Reason for cancelling (optional)</FieldLabel>
        <Textarea
          id="cancel-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={submitting}
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="button" data-testid="cancel-confirm" variant="destructive" onClick={handleCancel} disabled={submitting}>
        {submitting ? "Cancelling…" : "Cancel event"}
      </Button>
    </div>
  );
}
