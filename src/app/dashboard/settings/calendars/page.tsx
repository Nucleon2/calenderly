import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangleIcon, CalendarSync } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CalendarConnectionCard } from "@/components/settings/calendar-connection-card";
import { ConnectGoogleButton } from "@/components/settings/connect-google-button";
import { GoogleSetupNotice } from "@/components/settings/google-setup-notice";
import { SettingsNav } from "@/components/settings/settings-nav";
import { requireOnboardedUser } from "@/server/auth/session";
import { env, isGoogleConfigured } from "@/lib/env";
import { connectGoogleCalendar, getCalendarConnection } from "@/server/calendar/service";
import { CalendarReauthRequiredError } from "@/server/calendar/errors";
import { GOOGLE_CALENDAR_SCOPES } from "@/server/calendar/google/scopes";

export const metadata: Metadata = {
  title: "Calendar connections",
};

type CalendarsPageProps = {
  searchParams: Promise<{ connected?: string; error?: string }>;
};

/** Better Auth redirects here with `?error=<code>` on the standard OAuth error callback. */
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Google sign-in was cancelled before it finished.",
  google_link_failed: "Couldn't connect to Google. Please try again.",
};

export default async function CalendarConnectionsPage({ searchParams }: CalendarsPageProps) {
  const user = await requireOnboardedUser();

  if (!isGoogleConfigured()) {
    return (
      <>
        <PageHeader
          title="Calendar connections"
          description="Connect calendars to keep your availability in sync and avoid double bookings."
        />
        <div className="mt-6 flex flex-col gap-6">
          <SettingsNav />
          <GoogleSetupNotice appUrl={env.APP_URL} />
        </div>
      </>
    );
  }

  const params = await searchParams;
  let reauthError: string | null = null;

  // The OAuth link redirect lands here with ?connected=1 — finish wiring up the connection once,
  // then drop the query param so a refresh doesn't repeat it.
  if (params.connected === "1") {
    try {
      await connectGoogleCalendar(user.id);
    } catch (error) {
      if (error instanceof CalendarReauthRequiredError) {
        reauthError = error.message;
      } else {
        throw error;
      }
    }
    if (!reauthError) {
      redirect("/dashboard/settings/calendars");
    }
  }

  const connection = await getCalendarConnection(user.id);
  const oauthError =
    !reauthError && params.error
      ? (OAUTH_ERROR_MESSAGES[params.error] ?? "Something went wrong connecting Google Calendar. Please try again.")
      : null;

  return (
    <>
      <PageHeader
        title="Calendar connections"
        description="Connect calendars to keep your availability in sync and avoid double bookings."
      />
      <div className="mt-6 flex flex-col gap-6">
        <SettingsNav />

        {oauthError && (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertTitle>Couldn&apos;t connect Google Calendar</AlertTitle>
            <AlertDescription>{oauthError}</AlertDescription>
          </Alert>
        )}

        {reauthError ? (
          <div className="flex flex-col gap-4 rounded-xl border border-border p-6">
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertTitle>Google needs more access</AlertTitle>
              <AlertDescription>{reauthError}</AlertDescription>
            </Alert>
            <ConnectGoogleButton
              scopes={GOOGLE_CALENDAR_SCOPES}
              label="Reconnect Google Calendar"
              className="w-fit"
            />
          </div>
        ) : connection ? (
          <CalendarConnectionCard connection={connection} scopes={GOOGLE_CALENDAR_SCOPES} />
        ) : (
          <EmptyState
            icon={CalendarSync}
            title="Connect Google Calendar"
            description="Check your existing events for conflicts, add confirmed bookings straight to your calendar, and generate Google Meet links automatically."
            action={<ConnectGoogleButton scopes={GOOGLE_CALENDAR_SCOPES} />}
          />
        )}
      </div>
    </>
  );
}
