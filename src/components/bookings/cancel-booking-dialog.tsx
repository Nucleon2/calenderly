"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cancelBookingAction } from "@/app/dashboard/bookings/actions";

type CancelBookingDialogProps = {
  uid: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the booking has been cancelled, with the trimmed reason (or null). */
  onCancelled: (reason: string | null) => void;
};

export function CancelBookingDialog({ uid, open, onOpenChange, onCancelled }: CancelBookingDialogProps) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) setReason("");
    onOpenChange(next);
  }

  async function handleConfirm() {
    setPending(true);
    const trimmedReason = reason.trim();
    const result = await cancelBookingAction({ uid, reason: trimmedReason || undefined });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Booking cancelled");
    setReason("");
    onOpenChange(false);
    onCancelled(trimmedReason || null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel booking?</DialogTitle>
          <DialogDescription>The invitee will be notified by email. This can&rsquo;t be undone.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cancel-booking-reason">Reason (optional)</Label>
          <Textarea
            id="cancel-booking-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Let the invitee know why you're cancelling…"
            rows={3}
            disabled={pending}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
            Keep booking
          </Button>
          <Button type="button" variant="destructive" onClick={() => void handleConfirm()} disabled={pending}>
            {pending ? "Cancelling…" : "Cancel booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
