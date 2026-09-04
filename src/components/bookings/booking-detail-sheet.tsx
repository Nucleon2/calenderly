"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/dashboard/copy-button";
import { CancelBookingDialog } from "@/components/bookings/cancel-booking-dialog";
import { formatInTz } from "@/lib/time";
import { describeLocation } from "@/server/bookings/view-model";
import { getBookingDetailAction, setNoShowAction } from "@/app/dashboard/bookings/actions";
import type { BookingListRowData } from "@/components/bookings/booking-list";

/**
 * Client-safe, JSON-serializable shape of `BookingDetail` from
 * `@/server/bookings/service` — a `BookingListRowData` plus the fields the
 * list view doesn't need.
 */
export type BookingDetailData = BookingListRowData & {
  urls: {
    manage: string;
    cancel: string;
    reschedule: string;
  };
  rescheduledToUid: string | null;
};

function formatTime(instant: Date, tz: string): string {
  return formatInTz(instant, tz, { hour: "numeric", minute: "2-digit" });
}

function formatFullDate(instant: Date, tz: string): string {
  return formatInTz(instant, tz, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

type BookingDetailSheetProps = {
  booking: BookingListRowData | null;
  hostTimezone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled: (bookingId: string, cancelReason: string | null) => void;
  onNoShowChange: (bookingId: string, noShow: boolean) => void;
};

export function BookingDetailSheet({
  booking,
  hostTimezone,
  open,
  onOpenChange,
  onCancelled,
  onNoShowChange,
}: BookingDetailSheetProps) {
  const [detail, setDetail] = useState<BookingDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [togglingNoShow, setTogglingNoShow] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [isPast, setIsPast] = useState(false);

  // Keeps rendering the last-selected booking's data while the sheet plays
  // its close transition, since `booking` itself is cleared to null by the
  // parent as soon as the close is requested. Adjusting state during render
  // (rather than in an effect) per https://react.dev/learn/you-might-not-need-an-effect.
  const [displayBooking, setDisplayBooking] = useState<BookingListRowData | null>(booking);
  if (booking && booking !== displayBooking) {
    setDisplayBooking(booking);
  }

  const bookingId = open ? (booking?.id ?? null) : null;

  // Reset the previous booking's detail as soon as we start loading a
  // different one, during render rather than as a synchronous effect body —
  // the effect below only performs the actual (async) fetch.
  const [loadedFor, setLoadedFor] = useState<string | null>(bookingId);
  if (bookingId !== loadedFor) {
    setLoadedFor(bookingId);
    setDetail(null);
    setDetailError(null);
    setLoadingDetail(Boolean(bookingId));
  }

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    void getBookingDetailAction(bookingId).then((result) => {
      if (cancelled) return;
      setLoadingDetail(false);
      if (result.ok) {
        setDetail(result.booking);
      } else {
        setDetailError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  useEffect(() => {
    if (!displayBooking) return;
    // One-shot "is this booking's start time already in the past" snapshot
    // (not a ticking clock) — Date.now() has no pure render-phase equivalent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPast(new Date(displayBooking.startUtc).getTime() < Date.now());
  }, [displayBooking]);

  if (!displayBooking) return null;

  const canCancel = displayBooking.status !== "cancelled";

  async function handleToggleNoShow() {
    if (!displayBooking) return;
    const nextNoShow = !displayBooking.noShow;
    setTogglingNoShow(true);
    const result = await setNoShowAction({ bookingId: displayBooking.id, noShow: nextNoShow });
    setTogglingNoShow(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(nextNoShow ? "Marked as no-show" : "No-show undone");
    onNoShowChange(displayBooking.id, nextNoShow);
    setDetail((prev) => (prev ? { ...prev, noShow: nextNoShow } : prev));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{displayBooking.eventType.title}</SheetTitle>
          <SheetDescription>
            {formatFullDate(new Date(displayBooking.startUtc), hostTimezone)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {displayBooking.status === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
            {displayBooking.status === "rescheduled" && <Badge variant="outline">Rescheduled</Badge>}
            {displayBooking.noShow && <Badge variant="outline">No-show</Badge>}
          </div>

          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground">
              {formatTime(new Date(displayBooking.startUtc), hostTimezone)} –{" "}
              {formatTime(new Date(displayBooking.endUtc), hostTimezone)} · {hostTimezone}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatTime(new Date(displayBooking.startUtc), displayBooking.inviteeTimezone)} –{" "}
              {formatTime(new Date(displayBooking.endUtc), displayBooking.inviteeTimezone)} for the invitee (
              {displayBooking.inviteeTimezone})
            </p>
          </div>

          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground">{displayBooking.inviteeName}</p>
            <p className="text-sm text-muted-foreground">{displayBooking.inviteeEmail}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">Location</p>
            <p className="text-sm text-foreground">
              {describeLocation(
                displayBooking.eventType.locationType,
                displayBooking.locationValue,
                displayBooking.meetingUrl,
              )}
            </p>
          </div>

          {displayBooking.answers.length > 0 && (
            <div className="flex flex-col gap-3">
              {displayBooking.answers.map((answer) => (
                <div key={answer.questionId}>
                  <p className="text-xs font-medium text-muted-foreground">{answer.label}</p>
                  <p className="text-sm break-words text-foreground">{answer.value}</p>
                </div>
              ))}
            </div>
          )}

          {displayBooking.cancelReason && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Cancellation reason</p>
              <p className="text-sm text-foreground">{displayBooking.cancelReason}</p>
            </div>
          )}

          {loadingDetail && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-2/3" />
            </div>
          )}
          {detailError && <p className="text-sm text-destructive">{detailError}</p>}
        </div>

        <SheetFooter className="flex-col gap-2">
          {detail?.meetingUrl && (
            <Button nativeButton={false}
              variant="outline"
              render={<Link href={detail.meetingUrl} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink /> Open meeting link
            </Button>
          )}
          {detail && (
            <div className="flex flex-wrap gap-2">
              <CopyButton value={detail.urls.reschedule} label="Copy reschedule link" variant="outline" size="sm" />
              <CopyButton value={detail.urls.cancel} label="Copy cancel link" variant="outline" size="sm" />
            </div>
          )}
          {isPast && canCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleToggleNoShow()}
              disabled={togglingNoShow}
            >
              {displayBooking.noShow ? "Undo no-show" : "Mark no-show"}
            </Button>
          )}
          {canCancel && (
            <Button type="button" variant="destructive" onClick={() => setCancelDialogOpen(true)}>
              Cancel booking
            </Button>
          )}
        </SheetFooter>
      </SheetContent>

      <CancelBookingDialog
        uid={displayBooking.uid}
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onCancelled={(reason) => onCancelled(displayBooking.id, reason)}
      />
    </Sheet>
  );
}
