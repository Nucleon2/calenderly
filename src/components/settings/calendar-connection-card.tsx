"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarList } from "@/components/settings/calendar-list";
import { ConnectGoogleButton } from "@/components/settings/connect-google-button";
import { disconnectCalendarAction, refreshCalendarsAction } from "@/app/dashboard/settings/calendars/actions";
import type { CalendarConnectionView } from "@/server/calendar/service";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.28 1.48-1.13 2.73-2.4 3.58v2.98h3.89c2.27-2.09 3.53-5.17 3.53-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.96-2.92l-3.89-2.98c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.09C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.2 7.2 0 0 1 4.9 12c0-.8.14-1.57.37-2.29V6.62H1.26A11.98 11.98 0 0 0 0 12c0 1.94.47 3.77 1.26 5.38l4.01-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.45-3.45C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.26 6.62l4.01 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

type CalendarConnectionCardProps = {
  connection: CalendarConnectionView;
  /** Google OAuth scopes to request when reconnecting, from `@/server/calendar/google/scopes`. */
  scopes: readonly string[];
};

export function CalendarConnectionCard({ connection: initialConnection, scopes }: CalendarConnectionCardProps) {
  const router = useRouter();
  const [connection, setConnection] = useState(initialConnection);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const needsReauth = connection.status === "needs_reauth";

  async function handleRefresh() {
    setRefreshing(true);
    const result = await refreshCalendarsAction();
    setRefreshing(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setConnection(result.connection);
    toast.success("Calendar list refreshed");
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const result = await disconnectCalendarAction();
    setDisconnecting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setDisconnectOpen(false);
    toast.success("Google Calendar disconnected");
    router.refresh();
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
              <GoogleIcon />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Google Calendar</CardTitle>
                <Badge variant={needsReauth ? "destructive" : "secondary"}>
                  {needsReauth ? "Needs reconnection" : "Active"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{connection.externalEmail}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void handleRefresh()} disabled={refreshing}>
              <RefreshCwIcon className={refreshing ? "animate-spin" : undefined} />
              {refreshing ? "Refreshing…" : "Refresh list"}
            </Button>
            <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
              <AlertDialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
                <Trash2Icon /> Disconnect
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect Google Calendar?</AlertDialogTitle>
                  <AlertDialogDescription>
                    New bookings will stop syncing to Google, and existing calendars will no longer be checked for
                    conflicts. You can reconnect at any time.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={disconnecting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    type="button"
                    variant="destructive"
                    onClick={() => void handleDisconnect()}
                    disabled={disconnecting}
                  >
                    {disconnecting ? "Disconnecting…" : "Disconnect"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {needsReauth && (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertTitle>Reconnect to keep syncing</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <span>
                {connection.lastSyncError ??
                  "Google needs you to reconnect and re-grant calendar access to keep this connection working."}
              </span>
              <ConnectGoogleButton scopes={scopes} label="Reconnect Google Calendar" size="sm" className="w-fit" />
            </AlertDescription>
          </Alert>
        )}

        <CalendarList
          calendars={connection.calendars}
          destinationCalendarId={connection.destinationCalendarId}
          onConnectionChange={setConnection}
        />
      </CardContent>
    </Card>
  );
}
