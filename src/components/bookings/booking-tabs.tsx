"use client";

import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type BookingRange = "upcoming" | "past" | "cancelled" | "custom";

const BOOKINGS_PATH = "/dashboard/bookings";

const RANGE_OPTIONS: { value: BookingRange; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "cancelled", label: "Cancelled" },
  { value: "custom", label: "Date range" },
];

type BookingTabsProps = {
  range: BookingRange;
  from?: string;
  to?: string;
};

function buildHref(range: BookingRange, from?: string, to?: string): string {
  const params = new URLSearchParams({ range });
  if (range === "custom") {
    if (from) params.set("from", from);
    if (to) params.set("to", to);
  }
  return `${BOOKINGS_PATH}?${params.toString()}`;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultFrom(): string {
  return isoDate(new Date());
}

function defaultTo(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return isoDate(date);
}

export function BookingTabs({ range, from, to }: BookingTabsProps) {
  const router = useRouter();

  function handleRangeChange(value: string) {
    const nextRange = value as BookingRange;
    if (nextRange === range) return;
    if (nextRange === "custom") {
      router.push(buildHref(nextRange, from ?? defaultFrom(), to ?? defaultTo()));
    } else {
      router.push(buildHref(nextRange));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={range} onValueChange={(value) => handleRangeChange(String(value))}>
        <TabsList>
          {RANGE_OPTIONS.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {range === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="booking-range-from">From</Label>
            <Input
              id="booking-range-from"
              type="date"
              value={from ?? ""}
              max={to}
              onChange={(event) => {
                const nextFrom = event.target.value || undefined;
                router.push(buildHref("custom", nextFrom, to));
              }}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="booking-range-to">To</Label>
            <Input
              id="booking-range-to"
              type="date"
              value={to ?? ""}
              min={from}
              onChange={(event) => {
                const nextTo = event.target.value || undefined;
                router.push(buildHref("custom", from, nextTo));
              }}
              className="w-40"
            />
          </div>
        </div>
      )}
    </div>
  );
}
