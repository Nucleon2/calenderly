"use client";

import { useMemo } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * All the arithmetic here is deliberately done on Date objects constructed
 * with the *local* constructor (`new Date(y, m - 1, d)`) and read back with
 * local getters. That keeps the grid's calendar math self-consistent
 * (server and client always agree on which weekday a given YYYY-MM-DD falls
 * on) without ever pretending these Dates are real instants — actual
 * booking instants are computed separately via `@/lib/time`.
 */
function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface MonthCalendarProps {
  /** First day of the displayed month, `YYYY-MM-DD`. */
  month: string;
  /** "Today" in the invitee's time zone, `YYYY-MM-DD`. Earlier dates are disabled. */
  today: string;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Dates (`YYYY-MM-DD`) within the displayed month that have at least one open slot. */
  availableDates: ReadonlySet<string>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onMonthChange: (month: string) => void;
  loading?: boolean;
}

export function MonthCalendar({
  month,
  today,
  weekStartsOn = 0,
  availableDates,
  selectedDate,
  onSelectDate,
  onMonthChange,
  loading = false,
}: MonthCalendarProps) {
  const monthDate = useMemo(() => parseLocalDate(month), [month]);

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn });
    const gridEnd = endOfWeek(endOfMonth(monthDate), { weekStartsOn });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [monthDate, weekStartsOn]);

  const weekdayLabels = useMemo(() => days.slice(0, 7).map((day) => format(day, "EEEEEE")), [days]);

  const todayYm = today.slice(0, 7);
  const prevMonth = formatLocalDate(subMonths(monthDate, 1));
  const nextMonth = formatLocalDate(addMonths(monthDate, 1));
  const canGoPrev = prevMonth.slice(0, 7) >= todayYm;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">{format(monthDate, "MMMM yyyy")}</h3>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Previous month"
            disabled={!canGoPrev || loading}
            onClick={() => onMonthChange(prevMonth)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Next month"
            disabled={loading}
            onClick={() => onMonthChange(nextMonth)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {weekdayLabels.map((label, index) => (
          <div key={index} className="py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dateStr = formatLocalDate(day);
          const inMonth = isSameMonth(day, monthDate);
          if (!inMonth) {
            return <div key={dateStr} aria-hidden="true" />;
          }

          const isPast = dateStr < today;
          const hasSlots = availableDates.has(dateStr);
          const isSelected = dateStr === selectedDate;
          // While slots are loading we don't yet know which days are
          // available, so every day stays disabled rather than briefly
          // appearing clickable and then flipping to disabled once the
          // fetch resolves.
          const disabled = isPast || loading || !hasSlots;

          return (
            <button
              key={dateStr}
              type="button"
              data-testid="calendar-day"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={format(day, "EEEE, MMMM d, yyyy")}
              onClick={() => onSelectDate(dateStr)}
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-full text-sm outline-none transition-colors",
                "focus-visible:ring-3 focus-visible:ring-ring/50",
                disabled
                  ? "cursor-not-allowed text-muted-foreground/40"
                  : "text-foreground hover:bg-muted",
                isSelected && !disabled && "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {day.getDate()}
              {hasSlots && !isSelected && !disabled && (
                <span className="absolute bottom-1 size-1 rounded-full bg-primary" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      {loading && <p className="text-center text-xs text-muted-foreground">Loading available days…</p>}
    </div>
  );
}
