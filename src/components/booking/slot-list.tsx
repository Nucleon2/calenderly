"use client";

import { useState } from "react";
import { formatInTz } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface Slot {
  start: string; // ISO UTC instant
  end: string; // ISO UTC instant
}

export interface SlotListProps {
  date: string | null;
  slots: Slot[];
  timezone: string;
  loading?: boolean;
  onConfirm: (slot: Slot) => void;
}

/** Column of time-of-day buttons for the selected date, with a Calendly-style two-step confirm. */
export function SlotList({ date, slots, timezone, loading = false, onConfirm }: SlotListProps) {
  const [use24h, setUse24h] = useState(false);
  const [pending, setPending] = useState<Slot | null>(null);

  if (!date) {
    return <p className="text-sm text-muted-foreground">Select a day to see available times.</p>;
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading times…</p>;
  }

  if (slots.length === 0) {
    return <p className="text-sm text-muted-foreground">No available times on this day.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          {formatInTz(new Date(`${date}T12:00:00Z`), timezone, { weekday: "long", month: "long", day: "numeric" })}
        </h3>
        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setUse24h(false)}
            aria-pressed={!use24h}
            className={cn(
              "rounded-md px-1.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              !use24h ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            12h
          </button>
          <button
            type="button"
            onClick={() => setUse24h(true)}
            aria-pressed={use24h}
            className={cn(
              "rounded-md px-1.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              use24h ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            24h
          </button>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {slots.map((slot) => {
          const isPending = pending?.start === slot.start;
          const label = formatInTz(new Date(slot.start), timezone, {
            hour: "numeric",
            minute: "2-digit",
            hour12: !use24h,
          });

          return (
            <li key={slot.start} className="flex gap-2">
              <Button
                type="button"
                data-testid="slot-time"
                variant={isPending ? "default" : "outline"}
                className="flex-1 justify-center"
                onClick={() => setPending(isPending ? null : slot)}
              >
                {label}
              </Button>
              {isPending && (
                <Button
                  type="button"
                  data-testid="slot-confirm"
                  onClick={() => onConfirm(slot)}
                  className="flex-1 justify-center"
                >
                  Confirm
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
