"use client";

import { useMemo, useState } from "react";
import { CopyIcon, PlusIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { TimeSelect } from "@/components/availability/time-select";
import type { WeeklyRuleInput } from "@/server/availability/schema";

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const DEFAULT_INTERVAL = { startMinute: 9 * 60, endMinute: 17 * 60 };

function orderedWeekdays(weekStart: 0 | 1 | 6): number[] {
  const days = [0, 1, 2, 3, 4, 5, 6];
  const startIndex = days.indexOf(weekStart);
  return [...days.slice(startIndex), ...days.slice(0, startIndex)];
}

interface WeeklyHoursProps {
  rules: WeeklyRuleInput[];
  onChange: (rules: WeeklyRuleInput[]) => void;
  /** 0 = Sunday, 1 = Monday, 6 = Saturday. Determines row order only. */
  weekStart?: 0 | 1 | 6;
  disabled?: boolean;
  /** Inline error message for `rules[index]` (start or end), if any. */
  errorFor?: (index: number) => string | undefined;
}

/** Seven rows (ordered from `weekStart`), each with a toggle and one or more
 * start/end interval rows. Operates on the flat `rules` array from
 * `weeklyRulesSchema`; grouping by weekday is purely presentational. */
export function WeeklyHours({ rules, onChange, weekStart = 0, disabled, errorFor }: WeeklyHoursProps) {
  const weekdays = useMemo(() => orderedWeekdays(weekStart), [weekStart]);

  const byWeekday = useMemo(() => {
    const map = new Map<number, { rule: WeeklyRuleInput; index: number }[]>();
    rules.forEach((rule, index) => {
      const list = map.get(rule.weekday) ?? [];
      list.push({ rule, index });
      map.set(rule.weekday, list);
    });
    for (const list of map.values()) list.sort((a, b) => a.rule.startMinute - b.rule.startMinute);
    return map;
  }, [rules]);

  function toggleDay(weekday: number, checked: boolean) {
    if (checked) {
      onChange([...rules, { weekday, ...DEFAULT_INTERVAL }]);
    } else {
      onChange(rules.filter((r) => r.weekday !== weekday));
    }
  }

  function addInterval(weekday: number) {
    const existing = byWeekday.get(weekday) ?? [];
    const last = existing[existing.length - 1]?.rule;
    let start = DEFAULT_INTERVAL.startMinute;
    let end = DEFAULT_INTERVAL.endMinute;
    if (last) {
      start = Math.min(last.endMinute + 15, 1425);
      end = Math.min(start + 60, 1440);
      if (end <= start) end = Math.min(start + 5, 1440);
    }
    onChange([...rules, { weekday, startMinute: start, endMinute: end }]);
  }

  function removeInterval(index: number) {
    onChange(rules.filter((_, i) => i !== index));
  }

  function updateInterval(index: number, patch: Partial<WeeklyRuleInput>) {
    onChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function copyToOtherDays(sourceWeekday: number, targets: number[]) {
    const sourceIntervals = (byWeekday.get(sourceWeekday) ?? []).map(({ rule }) => ({
      startMinute: rule.startMinute,
      endMinute: rule.endMinute,
    }));
    const withoutTargets = rules.filter((r) => !targets.includes(r.weekday));
    const copied = targets.flatMap((weekday) => sourceIntervals.map((iv) => ({ weekday, ...iv })));
    onChange([...withoutTargets, ...copied]);
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
      {weekdays.map((weekday) => {
        const dayIntervals = byWeekday.get(weekday) ?? [];
        const isEnabled = dayIntervals.length > 0;
        const label = WEEKDAY_LABELS[weekday];

        return (
          <div key={weekday} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
            <label className="flex w-36 shrink-0 items-center gap-3">
              <Switch
                checked={isEnabled}
                onCheckedChange={(checked) => toggleDay(weekday, checked)}
                disabled={disabled}
              />
              <span className="text-sm font-medium text-foreground">{label}</span>
            </label>

            <div className="flex flex-1 flex-col gap-2">
              {!isEnabled && <span className="pt-1.5 text-sm text-muted-foreground">Unavailable</span>}

              {dayIntervals.map(({ rule, index }) => {
                const error = errorFor?.(index);
                return (
                  <div key={index} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <TimeSelect
                        value={rule.startMinute}
                        onValueChange={(next) => updateInterval(index, { startMinute: next })}
                        max={1425}
                        disabled={disabled}
                        aria-label={`${label} start time`}
                        aria-invalid={!!error}
                      />
                      <span className="text-sm text-muted-foreground" aria-hidden>
                        –
                      </span>
                      <TimeSelect
                        value={rule.endMinute}
                        onValueChange={(next) => updateInterval(index, { endMinute: next })}
                        min={5}
                        disabled={disabled}
                        aria-label={`${label} end time`}
                        aria-invalid={!!error}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${label} interval`}
                        onClick={() => removeInterval(index)}
                        disabled={disabled}
                      >
                        <TrashIcon />
                      </Button>
                    </div>
                    {error && <p className="text-xs text-destructive">{error}</p>}
                  </div>
                );
              })}

              {isEnabled && (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Add another interval to ${label}`}
                    onClick={() => addInterval(weekday)}
                    disabled={disabled}
                  >
                    <PlusIcon />
                  </Button>
                  <CopyToDaysPopover
                    sourceLabel={label}
                    sourceWeekday={weekday}
                    weekdays={weekdays}
                    disabled={disabled}
                    onCopy={(targets) => copyToOtherDays(weekday, targets)}
                  />
                </div>
              )}

              {!isEnabled && (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addInterval(weekday)}
                    disabled={disabled}
                  >
                    <PlusIcon /> Add hours
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CopyToDaysPopover({
  sourceWeekday,
  sourceLabel,
  weekdays,
  disabled,
  onCopy,
}: {
  sourceWeekday: number;
  sourceLabel: string;
  weekdays: number[];
  disabled?: boolean;
  onCopy: (targets: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const targets = weekdays.filter((w) => w !== sourceWeekday);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSelected([]);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Copy ${sourceLabel} hours to other days`}
            disabled={disabled}
          />
        }
      >
        <CopyIcon />
      </PopoverTrigger>
      <PopoverContent className="w-56">
        <p className="mb-2 text-sm font-medium text-foreground">Copy times to</p>
        <div className="flex flex-col gap-2">
          {targets.map((weekday) => (
            <label key={weekday} className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={selected.includes(weekday)}
                onCheckedChange={(checked) =>
                  setSelected((prev) => (checked ? [...prev, weekday] : prev.filter((w) => w !== weekday)))
                }
              />
              {WEEKDAY_LABELS[weekday]}
            </label>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={selected.length === 0}
            onClick={() => {
              onCopy(selected);
              setOpen(false);
            }}
          >
            Copy
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
