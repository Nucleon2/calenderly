import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { EventTypeList } from "@/components/event-types/event-type-list";
import { requireOnboardedUser } from "@/server/auth/session";
import { listEventTypes } from "@/server/event-types/service";

export const metadata: Metadata = {
  title: "Event types",
};

export default async function EventTypesPage() {
  const user = await requireOnboardedUser();
  const eventTypes = await listEventTypes(user.id);

  return (
    <>
      <PageHeader
        title="Event types"
        description="The kinds of meetings people can book with you."
        actions={
          <Button render={<Link href="/dashboard/event-types/new" />}>
            <Plus /> New event type
          </Button>
        }
      />
      <EventTypeList eventTypes={eventTypes} />
    </>
  );
}
