"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteEventTypeAction, setEventTypeActiveAction } from "@/app/dashboard/event-types/actions";

type DeleteEventTypeDialogProps = {
  eventTypeId: string;
  eventTypeTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the event type is deleted, or deactivated in its place. */
  onDone: () => void;
};

export function DeleteEventTypeDialog({
  eventTypeId,
  eventTypeTitle,
  open,
  onOpenChange,
  onDone,
}: DeleteEventTypeDialogProps) {
  const [pending, setPending] = useState(false);
  const [hasBookings, setHasBookings] = useState(false);

  const reset = () => {
    setPending(false);
    setHasBookings(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleDelete = async () => {
    setPending(true);
    const result = await deleteEventTypeAction(eventTypeId);
    setPending(false);
    if (!result.ok) {
      if (result.hasBookings) {
        setHasBookings(true);
        return;
      }
      toast.error(result.error);
      return;
    }
    toast.success("Event type deleted");
    onOpenChange(false);
    reset();
    onDone();
  };

  const handleDeactivate = async () => {
    setPending(true);
    const result = await setEventTypeActiveAction(eventTypeId, false);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Event type deactivated");
    onOpenChange(false);
    reset();
    onDone();
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{eventTypeTitle}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasBookings
              ? "This event type has existing bookings, so it can't be deleted. You can deactivate it instead — it will no longer accept new bookings, but past bookings are kept."
              : "This can't be undone. Anyone with the booking link will no longer be able to book this event type."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          {hasBookings ? (
            <Button type="button" onClick={handleDeactivate} disabled={pending}>
              {pending ? "Deactivating…" : "Deactivate instead"}
            </Button>
          ) : (
            <AlertDialogAction
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
