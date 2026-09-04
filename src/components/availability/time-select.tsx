"use client";

import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TimeSelectProps {
  id?: string;
  /** Minutes since local midnight (0..1440). */
  value: number;
  onValueChange: (value: number) => void;
  /** Inclusive lower bound, in minutes since local midnight. */
  min?: number;
  /** Inclusive upper bound, in minutes since local midnight. */
  max?: number;
  stepMinutes?: number;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}

const DEFAULT_STEP = 15;

/** 12h/24h per the viewer's locale, e.g. "9:00 AM" or "09:00". */
export function formatMinuteOfDay(minute: number): string {
  const hours = Math.floor(minute / 60);
  const mins = minute % 60;
  const reference = new Date(2000, 0, 1, hours, mins);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(reference);
}

/** A single time-of-day picker in `stepMinutes` increments (default 15). Always
 * includes `value` itself even if it falls off the step grid, so an odd stored
 * minute (e.g. from a seeded schedule) still renders correctly. */
export function TimeSelect({
  id,
  value,
  onValueChange,
  min = 0,
  max = 1440,
  stepMinutes = DEFAULT_STEP,
  disabled,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: TimeSelectProps) {
  const options = useMemo(() => {
    const minutes = new Set<number>();
    for (let m = 0; m <= 1440; m += stepMinutes) {
      if (m >= min && m <= max) minutes.add(m);
    }
    minutes.add(value);
    return [...minutes].sort((a, b) => a - b).map((m) => ({ value: m, label: formatMinuteOfDay(m) }));
  }, [min, max, stepMinutes, value]);

  return (
    <Select
      items={options.map((option) => ({ value: String(option.value), label: option.label }))}
      value={String(value)}
      onValueChange={(next) => onValueChange(Number(next))}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-32" aria-label={ariaLabel} aria-invalid={ariaInvalid}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={String(option.value)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
