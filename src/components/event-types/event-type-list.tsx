"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarRange, Copy, MapPin, MoreVertical, Pencil, PhoneCall, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { CopyButton } from "@/components/dashboard/copy-button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DeleteEventTypeDialog } from "@/components/event-types/delete-event-type-dialog";
import { duplicateEventTypeAction, setEventTypeActiveAction } from "@/app/dashboard/event-types/actions";
import type { EventTypeListItem } from "@/server/event-types/service";

const LOCATION_ICON = {
  google_meet: Video,
  phone: PhoneCall,
  in_person: MapPin,
  custom: CalendarRange,
} as const;

const LOCATION_LABEL = {
  google_meet: "Google Meet",
  phone: "Phone call",
  in_person: "In person",
  custom: "Custom",
} as const;

type EventTypeListProps = {
  eventTypes: EventTypeListItem[];
};

export function EventTypeList({ eventTypes }: EventTypeListProps) {
  const [items, setItems] = useState(eventTypes);
  const [pendingDuplicateId, setPendingDuplicateId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventTypeListItem | null>(null);
  const [, startDuplicate] = useTransition();

  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="No event types yet"
        description="Create your first event type to start letting people book time with you."
        action={
          <Button render={<Link href="/dashboard/event-types/new" />}>New event type</Button>
        }
      />
    );
  }

  const handleToggleActive = (id: string, active: boolean) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isActive: active } : item)));
    void (async () => {
      const result = await setEventTypeActiveAction(id, active);
      if (!result.ok) {
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isActive: !active } : item)));
        toast.error(result.error);
      }
    })();
  };

  const handleDuplicate = (id: string) => {
    setPendingDuplicateId(id);
    startDuplicate(async () => {
      const result = await duplicateEventTypeAction(id);
      setPendingDuplicateId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Event type duplicated");
      window.location.reload();
    });
  };

  return (
    <>
      <div className="grid gap-3">
        {items.map((eventType) => {
          const Icon = LOCATION_ICON[eventType.locationType];
          return (
            <Card key={eventType.id} className="flex-row items-stretch gap-0 overflow-hidden p-0">
              <div className="w-1.5 shrink-0" style={{ backgroundColor: eventType.color }} aria-hidden="true" />
              <div className="flex flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/event-types/${eventType.id}`}
                      className="text-sm font-medium text-foreground hover:underline"
                    >
                      {eventType.title}
                    </Link>
                    {eventType.isSecret && <Badge variant="secondary">Secret</Badge>}
                    {!eventType.isActive && <Badge variant="outline">Inactive</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span>{eventType.durationMinutes} min</span>
                    <span aria-hidden="true">·</span>
                    <Icon className="size-3.5" aria-hidden="true" />
                    <span>{LOCATION_LABEL[eventType.locationType]}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <CopyButton value={eventType.bookingPageUrl} label="Copy link" size="sm" variant="outline" />
                  <Switch
                    checked={eventType.isActive}
                    onCheckedChange={(checked) => handleToggleActive(eventType.id, checked)}
                    aria-label={eventType.isActive ? "Deactivate event type" : "Activate event type"}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" aria-label={`More actions for ${eventType.title}`} />}
                    >
                      <MoreVertical className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem render={<Link href={`/dashboard/event-types/${eventType.id}`} />}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDuplicate(eventType.id)}
                        disabled={pendingDuplicateId === eventType.id}
                      >
                        <Copy /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(eventType)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {deleteTarget && (
        <DeleteEventTypeDialog
          eventTypeId={deleteTarget.id}
          eventTypeTitle={deleteTarget.title}
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          onDone={() => {
            setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));
            setDeleteTarget(null);
          }}
        />
      )}
    </>
  );
}
