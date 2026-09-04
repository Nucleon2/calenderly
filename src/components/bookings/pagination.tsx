"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BookingRange } from "@/components/bookings/booking-tabs";

const BOOKINGS_PATH = "/dashboard/bookings";

type PaginationProps = {
  page: number;
  limit: number;
  total: number;
  range: BookingRange;
  from?: string;
  to?: string;
};

function buildHref(page: number, range: BookingRange, from?: string, to?: string): string {
  const params = new URLSearchParams({ range });
  if (range === "custom") {
    if (from) params.set("from", from);
    if (to) params.set("to", to);
  }
  if (page > 1) params.set("page", String(page));
  return `${BOOKINGS_PATH}?${params.toString()}`;
}

export function Pagination({ page, limit, total, range, from, to }: PaginationProps) {
  const router = useRouter();

  if (total <= limit && page <= 1) return null;

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <p className="text-sm text-muted-foreground">
        Showing {rangeStart}–{rangeEnd} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasPrev}
          onClick={() => router.push(buildHref(page - 1, range, from, to))}
        >
          <ChevronLeft /> Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={() => router.push(buildHref(page + 1, range, from, to))}
        >
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
