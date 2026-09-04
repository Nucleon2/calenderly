"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { StarIcon, TrashIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteScheduleAction, setDefaultScheduleAction } from "@/app/dashboard/availability/actions";

interface ScheduleHeaderProps {
  scheduleId: string;
  name: string;
  onNameChange: (name: string) => void;
  nameError?: string;
  isDefault: boolean;
}

/** Inline rename, "set as default", and delete (with confirm dialog). The
 * name field is controlled by the parent editor's form state — this
 * component doesn't own the save; only "set default" and "delete" act
 * immediately. */
export function ScheduleHeader({ scheduleId, name, onNameChange, nameError, isDefault }: ScheduleHeaderProps) {
  const router = useRouter();
  const [isSettingDefault, startSetDefault] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleSetDefault() {
    startSetDefault(async () => {
      const result = await setDefaultScheduleAction(scheduleId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Default schedule updated");
      router.refresh();
    });
  }

  function handleDelete() {
    startDelete(async () => {
      const result = await deleteScheduleAction(scheduleId);
      // On success `deleteScheduleAction` redirects, which throws and never
      // resolves here. A resolved value means it failed.
      if (result && !result.ok) {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Schedule name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            aria-invalid={!!nameError}
            className="h-9 w-full max-w-sm text-base font-semibold sm:w-auto"
          />
          {isDefault && <Badge variant="secondary">Default</Badge>}
        </div>
        {nameError && (
          <p role="alert" className="text-sm text-destructive">
            {nameError}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {!isDefault && (
          <Button type="button" variant="outline" size="sm" onClick={handleSetDefault} disabled={isSettingDefault}>
            <StarIcon /> {isSettingDefault ? "Setting…" : "Set as default"}
          </Button>
        )}

        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogTrigger
            render={<Button type="button" variant="destructive" size="sm" disabled={isDefault} />}
          >
            <TrashIcon /> Delete
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this schedule?</AlertDialogTitle>
              <AlertDialogDescription>
                Event types using this schedule will lose it and need a new one assigned. This can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
