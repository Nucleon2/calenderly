import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BookingRange } from "@/components/bookings/booking-tabs";

type ExportButtonProps = {
  range: BookingRange;
  from?: string;
  to?: string;
};

function buildExportHref(range: BookingRange, from?: string, to?: string): string {
  const params = new URLSearchParams({ range });
  if (range === "custom") {
    if (from) params.set("from", from);
    if (to) params.set("to", to);
  }
  return `/api/bookings/export?${params.toString()}`;
}

/** Renders as a plain dropdown — no client hooks needed since the current
 * filters are passed down from the (server) page rather than read from the
 * browser location. */
export function ExportButton({ range, from, to }: ExportButtonProps) {
  const href = buildExportHref(range, from, to);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Download /> Export
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem nativeButton={false} render={<Link href={href} />}>Export current view as CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
