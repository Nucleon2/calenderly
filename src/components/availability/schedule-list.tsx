import Link from "next/link";
import { ChevronRightIcon, Clock, PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { createScheduleAction } from "@/app/dashboard/availability/actions";
import type { ScheduleListItem } from "@/server/availability/service";

interface ScheduleListProps {
  schedules: ScheduleListItem[];
}

/** Server Component: schedule overview + a "New schedule" form (a plain
 * `<form action>` — the create flow needs no client-side state) that
 * redirects straight to the new schedule's editor. */
export function ScheduleList({ schedules }: ScheduleListProps) {
  // Inline server action: `createScheduleAction` returns an `ActionResult`
  // (for the redirect-throws-so-only-the-error-case-resolves pattern), but a
  // plain `<form action>` needs `(formData) => void | Promise<void>`.
  async function createSchedule() {
    "use server";
    await createScheduleAction();
  }

  if (schedules.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="Create your first schedule"
        description="Set your weekly hours so people can only book time when you're actually free."
        action={
          <form action={createSchedule}>
            <Button type="submit">
              <PlusIcon /> New schedule
            </Button>
          </form>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <form action={createSchedule}>
          <Button type="submit" variant="outline" size="sm">
            <PlusIcon /> New schedule
          </Button>
        </form>
      </div>

      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {schedules.map((schedule) => (
          <li key={schedule.id}>
            <Link
              href={`/dashboard/availability/${schedule.id}`}
              className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{schedule.name}</span>
                  {schedule.isDefault && <Badge variant="secondary">Default</Badge>}
                </div>
                <span className="text-sm text-muted-foreground">{schedule.summary}</span>
                <span className="text-xs text-muted-foreground">{schedule.timezone}</span>
              </div>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
