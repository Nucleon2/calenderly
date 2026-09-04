"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  setDestinationCalendarAction,
  updateSelectedCalendarsAction,
} from "@/app/dashboard/settings/calendars/actions";
import type { CalendarConnectionView } from "@/server/calendar/service";

type CalendarListItem = CalendarConnectionView["calendars"][number];

type CalendarListProps = {
  calendars: CalendarListItem[];
  destinationCalendarId: string | null;
  onConnectionChange: (connection: CalendarConnectionView) => void;
};

const SAVE_DEBOUNCE_MS = 600;

/**
 * "Check for conflicts" checkboxes (debounced auto-save) and the "Add bookings to" destination
 * picker (saved immediately). The view doesn't expose which calendars are writable, so every
 * calendar is offered as a destination and a write failure surfaces via the service's error.
 */
export function CalendarList({ calendars, destinationCalendarId, onConnectionChange }: CalendarListProps) {
  const [items, setItems] = useState(calendars);
  const [destination, setDestination] = useState(destinationCalendarId);
  const [savingSelection, setSavingSelection] = useState(false);
  const [savingDestination, setSavingDestination] = useState(false);

  // Re-sync local (optimistic) state when the parent hands down a fresh connection — e.g. after
  // a refresh — without going through an effect (React's "adjust state during render" pattern).
  const [prevCalendars, setPrevCalendars] = useState(calendars);
  if (calendars !== prevCalendars) {
    setPrevCalendars(calendars);
    setItems(calendars);
  }
  const [prevDestinationCalendarId, setPrevDestinationCalendarId] = useState(destinationCalendarId);
  if (destinationCalendarId !== prevDestinationCalendarId) {
    setPrevDestinationCalendarId(destinationCalendarId);
    setDestination(destinationCalendarId);
  }

  const itemsRef = useRef(items);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, []);

  async function persistSelection() {
    setSavingSelection(true);
    const payload = itemsRef.current.map((calendar) => ({
      externalCalendarId: calendar.externalCalendarId,
      isCheckedForConflicts: calendar.isCheckedForConflicts,
    }));
    const result = await updateSelectedCalendarsAction(payload);
    setSavingSelection(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onConnectionChange(result.connection);
  }

  function toggleCalendar(externalCalendarId: string, checked: boolean) {
    setItems((prev) =>
      prev.map((calendar) =>
        calendar.externalCalendarId === externalCalendarId
          ? { ...calendar, isCheckedForConflicts: checked }
          : calendar,
      ),
    );
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => void persistSelection(), SAVE_DEBOUNCE_MS);
  }

  async function handleDestinationChange(externalCalendarId: string) {
    const previous = destination;
    setDestination(externalCalendarId);
    setSavingDestination(true);
    const result = await setDestinationCalendarAction(externalCalendarId);
    setSavingDestination(false);
    if (!result.ok) {
      setDestination(previous);
      toast.error(result.error);
      return;
    }
    onConnectionChange(result.connection);
    toast.success("Bookings will be added to this calendar");
  }

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
        No calendars found on this account yet. Try refreshing the list.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Check for conflicts</h3>
          {savingSelection && <span className="text-xs text-muted-foreground">Saving…</span>}
        </div>
        <div className="flex flex-col gap-2">
          {items.map((calendar) => (
            <Label
              key={calendar.externalCalendarId}
              htmlFor={`conflict-${calendar.externalCalendarId}`}
              className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm font-normal text-foreground"
            >
              <Checkbox
                id={`conflict-${calendar.externalCalendarId}`}
                checked={calendar.isCheckedForConflicts}
                onCheckedChange={(checked) => toggleCalendar(calendar.externalCalendarId, checked === true)}
              />
              {calendar.name}
            </Label>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Busy time on checked calendars blocks new bookings from overlapping.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="destination-calendar" className="text-sm font-medium text-foreground">
            Add bookings to
          </Label>
          {savingDestination && <span className="text-xs text-muted-foreground">Saving…</span>}
        </div>
        <Select
          items={items.map((calendar) => ({ value: calendar.externalCalendarId, label: calendar.name }))}
          value={destination ?? undefined}
          onValueChange={(value) => {
            if (value) void handleDestinationChange(value);
          }}
        >
          <SelectTrigger id="destination-calendar" className="w-full">
            <SelectValue placeholder="Choose a calendar" />
          </SelectTrigger>
          <SelectContent>
            {items.map((calendar) => (
              <SelectItem key={calendar.externalCalendarId} value={calendar.externalCalendarId}>
                {calendar.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
