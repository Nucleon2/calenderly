"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { todayInTz } from "@/lib/time";
import { detectBrowserTimezone } from "@/lib/timezones";
import { EventSummary, type PublicLocationDetails, type PublicLocationType } from "@/components/booking/event-summary";
import { MonthCalendar } from "@/components/booking/month-calendar";
import { SlotList, type Slot } from "@/components/booking/slot-list";
import { TimezonePicker } from "@/components/booking/timezone-picker";
import { BookingForm, type BookingFormQuestion, type BookingFormSubmitResult, type BookingFormSubmitValues } from "@/components/booking/booking-form";
import { getSlotsAction, submitBookingAction } from "@/app/(public)/[username]/[eventSlug]/actions";

export interface BookingPageEventType {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  locationType: PublicLocationType;
  locationDetails: PublicLocationDetails;
  questions: BookingFormQuestion[];
}

export interface BookingPageHost {
  name: string;
  username: string;
  image: string | null;
  timezone: string;
  /** 0 (Sunday) .. 6 (Saturday). Not exposed by the public read APIs today — defaults to Sunday. */
  weekStart: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export interface BookingPageProps {
  eventType: BookingPageEventType;
  host: BookingPageHost;
  /** First day of the initially-displayed month, `YYYY-MM-DD`, in `initialTimezone`. */
  initialMonth: string;
  initialTimezone: string;
  /** Whether `?tz=` was present in the URL — if not, we override with the detected browser tz on mount. */
  hasExplicitTimezone: boolean;
  initialSlotsByDate: Record<string, Slot[]>;
  rescheduleUid?: string;
  formerTime?: { start: string; end: string } | null;
}

function lastDayOfMonth(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  const days = new Date(y!, m!, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(days).padStart(2, "0")}`;
}

export function BookingPage({
  eventType,
  host,
  initialMonth,
  initialTimezone,
  hasExplicitTimezone,
  initialSlotsByDate,
  rescheduleUid,
  formerTime,
}: BookingPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [timezone, setTimezone] = useState(initialTimezone);
  const [month, setMonth] = useState(initialMonth);
  const [slotsByDate, setSlotsByDate] = useState<Record<string, Slot[]>>(initialSlotsByDate);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [step, setStep] = useState<"picker" | "form">("picker");

  const isFirstRender = useRef(true);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const today = useMemo(() => todayInTz(new Date(), timezone), [timezone]);

  async function fetchSlots(nextMonth: string, nextTimezone: string) {
    setLoadingSlots(true);
    const result = await getSlotsAction({
      eventTypeId: eventType.id,
      monthStart: nextMonth,
      monthEnd: lastDayOfMonth(nextMonth),
      timezone: nextTimezone,
      excludeBookingUid: rescheduleUid,
    });
    setLoadingSlots(false);
    if (!result.ok) {
      toast.error(result.error);
      setSlotsByDate({});
      return;
    }
    setSlotsByDate(result.slotsByDate);
  }

  // Detect the browser's real time zone once on mount when the URL didn't
  // pin one explicitly, and refetch for it. This has to be an effect: the
  // server (and the client's first hydration pass) can only know
  // `initialTimezone` (the host's tz); the actual browser tz is only
  // knowable after mount, so setting it any earlier would either be wrong
  // (during SSR) or cause a hydration mismatch (during the first client
  // render).
  useEffect(() => {
    if (hasExplicitTimezone) return;
    const detected = detectBrowserTimezone();
    if (detected && detected !== initialTimezone) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing a browser-only API (Intl) into state after mount, not mirroring props/state.
      setTimezone(detected);
      updateUrl({ tz: detected });
      void fetchSlots(month, detected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void fetchSlots(month, timezone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, timezone]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  function updateUrl(next: { month?: string; date?: string | null; tz?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.month !== undefined) params.set("month", next.month);
    if (next.tz !== undefined) params.set("tz", next.tz);
    if (next.date !== undefined) {
      if (next.date) params.set("date", next.date);
      else params.delete("date");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const availableDates = useMemo(() => {
    const set = new Set<string>();
    for (const [date, slots] of Object.entries(slotsByDate)) {
      if (slots.length > 0) set.add(date);
    }
    return set;
  }, [slotsByDate]);

  const slotsForSelectedDate = selectedDate ? (slotsByDate[selectedDate] ?? []) : [];

  function handleMonthChange(nextMonth: string) {
    setMonth(nextMonth);
    setSelectedDate(null);
    setSelectedSlot(null);
    updateUrl({ month: nextMonth, date: null });
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    updateUrl({ date });
  }

  function handleTimezoneChange(nextTimezone: string) {
    setTimezone(nextTimezone);
    setSelectedDate(null);
    setSelectedSlot(null);
    updateUrl({ tz: nextTimezone, date: null });
  }

  function handleConfirmSlot(slot: Slot) {
    setSelectedSlot(slot);
    setStep("form");
  }

  function handleBack() {
    setStep("picker");
  }

  async function handleSubmit(values: BookingFormSubmitValues): Promise<BookingFormSubmitResult> {
    if (!selectedSlot) {
      return { ok: false, error: "Please pick a time first." };
    }

    const result = await submitBookingAction({
      eventTypeId: eventType.id,
      startUtc: selectedSlot.start,
      inviteeName: values.inviteeName,
      inviteeEmail: values.inviteeEmail,
      inviteeTimezone: timezone,
      answers: values.answers,
      rescheduleFromUid: rescheduleUid,
      faxConfirm: values.faxConfirm,
      startedAt: values.startedAt,
    });

    if (result.ok) {
      // submitBookingAction redirects on success; this branch is unreachable
      // in practice, but keeps the return type total.
      return { ok: true };
    }

    if (result.code === "slot_unavailable") {
      toast.error(result.error);
      setStep("picker");
      setSelectedSlot(null);
      void fetchSlots(month, timezone);
      return { ok: true };
    }

    return { ok: false, error: result.error, field: result.field };
  }

  return (
    <div className="grid gap-8 md:grid-cols-[280px_1fr]">
      <div>
        <EventSummary
          title={eventType.title}
          durationMinutes={eventType.durationMinutes}
          description={eventType.description}
          locationType={eventType.locationType}
          locationDetails={eventType.locationDetails}
          hostName={host.name}
          hostImage={host.image}
          timezone={timezone}
          selectedSlot={selectedSlot}
          formerTime={formerTime}
        />
      </div>

      <div>
        {step === "picker" ? (
          <div className="flex flex-col gap-6">
            <h2 ref={headingRef} tabIndex={-1} className="sr-only">
              Pick a date and time
            </h2>
            <TimezonePicker value={timezone} onValueChange={handleTimezoneChange} />
            <div className="grid gap-6 sm:grid-cols-2">
              <MonthCalendar
                month={month}
                today={today}
                weekStartsOn={host.weekStart}
                availableDates={availableDates}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
                onMonthChange={handleMonthChange}
                loading={loadingSlots}
              />
              <SlotList
                date={selectedDate}
                slots={slotsForSelectedDate}
                timezone={timezone}
                loading={loadingSlots && !!selectedDate}
                onConfirm={handleConfirmSlot}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">
              Enter your details
            </h2>
            <BookingForm questions={eventType.questions} onBack={handleBack} onSubmit={handleSubmit} />
          </div>
        )}
      </div>
    </div>
  );
}
