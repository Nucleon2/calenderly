"use client";

import { useMemo, useState } from "react";
import { PlusIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { formatMinuteOfDay, TimeSelect } from "@/components/availability/time-select";
import type { LocalDate } from "@/lib/time";
import { todayInTz } from "@/lib/time";
import type { DateOverrideInput, IntervalInput } from "@/server/availability/schema";

interface DateOverridesProps {
  overrides: DateOverrideInput[];
  onChange: (overrides: DateOverrideInput[]) => void;
  timezone: string;
  disabled?: boolean;
  errorFor?: (index: number) => string | undefined;
}

function localDateFromJsDate(date: Date): LocalDate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function jsDateFromLocalDate(date: LocalDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatOverrideDate(date: LocalDate): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(jsDateFromLocalDate(date));
}

/** Sorted list of date overrides, plus an "Add override" dialog (calendar +
 * either "unavailable all day" or custom hours) that can set several dates at
 * once. Operates on the `overrides` array from `scheduleInputSchema`. */
export function DateOverrides({ overrides, onChange, timezone, disabled, errorFor }: DateOverridesProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  // Bumped on every open so `AddOverrideDialogContent` remounts with fresh
  // local state instead of keeping the previous selection around.
  const [dialogKey, setDialogKey] = useState(0);

  const sorted = useMemo(
    () =>
      overrides
        .map((override, index) => ({ override, index }))
        .sort((a, b) => (a.override.date < b.override.date ? -1 : a.override.date > b.override.date ? 1 : 0)),
    [overrides],
  );

  function removeOverride(date: string) {
    onChange(overrides.filter((o) => o.date !== date));
  }

  /** Replaces any existing override for each of `dates` (dates are unique per schedule). */
  function addOverrides(dates: LocalDate[], intervals: IntervalInput[] | null) {
    const dateSet = new Set(dates);
    const withoutDates = overrides.filter((o) => !dateSet.has(o.date));
    const added: DateOverrideInput[] = dates.map((date) => ({ date, intervals }));
    onChange([...withoutDates, ...added]);
  }

  return (
    <div className="flex flex-col gap-3">
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No date overrides yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {sorted.map(({ override, index }) => {
            const error = errorFor?.(index);
            const hasHours = override.intervals && override.intervals.length > 0;
            return (
              <li key={override.date} className="flex items-center justify-between gap-3 p-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{formatOverrideDate(override.date)}</span>
                  <span className="text-sm text-muted-foreground">
                    {hasHours
                      ? override.intervals!
                          .map((iv) => `${formatMinuteOfDay(iv.startMinute)} – ${formatMinuteOfDay(iv.endMinute)}`)
                          .join(", ")
                      : "Unavailable"}
                  </span>
                  {error && <span className="text-xs text-destructive">{error}</span>}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove override for ${formatOverrideDate(override.date)}`}
                  onClick={() => removeOverride(override.date)}
                  disabled={disabled}
                >
                  <TrashIcon />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (next) setDialogKey((k) => k + 1);
        }}
      >
        <DialogTrigger render={<Button type="button" variant="outline" size="sm" disabled={disabled} />}>
          <PlusIcon /> Add override
        </DialogTrigger>
        <AddOverrideDialogContent
          key={dialogKey}
          timezone={timezone}
          onSave={(dates, intervals) => {
            addOverrides(dates, intervals);
            setDialogOpen(false);
          }}
          onClose={() => setDialogOpen(false)}
        />
      </Dialog>
    </div>
  );
}

function AddOverrideDialogContent({
  timezone,
  onSave,
  onClose,
}: {
  timezone: string;
  onSave: (dates: LocalDate[], intervals: IntervalInput[] | null) => void;
  onClose: () => void;
}) {
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [intervals, setIntervals] = useState<IntervalInput[]>([{ startMinute: 9 * 60, endMinute: 17 * 60 }]);

  const today = useMemo(() => jsDateFromLocalDate(todayInTz(new Date(), timezone)), [timezone]);

  function addInterval() {
    const last = intervals[intervals.length - 1];
    const start = last ? Math.min(last.endMinute + 15, 1425) : 9 * 60;
    const end = Math.min(Math.max(start + 60, start + 5), 1440);
    setIntervals([...intervals, { startMinute: start, endMinute: end }]);
  }

  function updateInterval(index: number, patch: Partial<IntervalInput>) {
    setIntervals(intervals.map((iv, i) => (i === index ? { ...iv, ...patch } : iv)));
  }

  function removeInterval(index: number) {
    setIntervals(intervals.filter((_, i) => i !== index));
  }

  const canSave = selectedDates.length > 0 && (unavailable || intervals.length > 0);

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Add date override</DialogTitle>
        <DialogDescription>Pick one or more dates, then set custom hours or mark them unavailable.</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <Calendar
          mode="multiple"
          selected={selectedDates}
          onSelect={(dates) => setSelectedDates(dates ?? [])}
          disabled={{ before: today }}
          className="mx-auto"
        />

        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Switch checked={unavailable} onCheckedChange={setUnavailable} />
          Unavailable all day
        </label>

        {!unavailable && (
          <div className="flex flex-col gap-2">
            {intervals.map((iv, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <TimeSelect
                  value={iv.startMinute}
                  onValueChange={(next) => updateInterval(index, { startMinute: next })}
                  max={1425}
                  aria-label="Override start time"
                />
                <span className="text-sm text-muted-foreground" aria-hidden>
                  –
                </span>
                <TimeSelect
                  value={iv.endMinute}
                  onValueChange={(next) => updateInterval(index, { endMinute: next })}
                  min={5}
                  aria-label="Override end time"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove interval"
                  onClick={() => removeInterval(index)}
                  disabled={intervals.length === 1}
                >
                  <TrashIcon />
                </Button>
              </div>
            ))}
            <div>
              <Button type="button" variant="ghost" size="sm" onClick={addInterval}>
                <PlusIcon /> Add interval
              </Button>
            </div>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!canSave}
          onClick={() => onSave(selectedDates.map(localDateFromJsDate), unavailable ? null : intervals)}
        >
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
