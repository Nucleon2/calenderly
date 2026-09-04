"use client";

import { Globe } from "lucide-react";
import { TimezoneSelect } from "@/components/settings/timezone-select";

export interface TimezonePickerProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

/** Labelled time zone picker for the booking flow. Reuses the dashboard's `TimezoneSelect`. */
export function TimezonePicker({ value, onValueChange, disabled }: TimezonePickerProps) {
  return (
    <div className="flex items-center gap-2">
      <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <TimezoneSelect value={value} onValueChange={onValueChange} disabled={disabled} />
    </div>
  );
}
