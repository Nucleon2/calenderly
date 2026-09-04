import { CalendarSync } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type GoogleSetupNoticeProps = {
  /** The app's public base URL (e.g. `env.APP_URL`), used to build the OAuth redirect URI. */
  appUrl: string;
};

/**
 * Shown instead of the connections UI when Google OAuth isn't configured
 * (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are missing). Server-safe — no
 * client interactivity, so it can render directly from a server component.
 */
export function GoogleSetupNotice({ appUrl }: GoogleSetupNoticeProps) {
  const redirectUri = `${appUrl}/api/auth/callback/google`;

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <CalendarSync className="size-5" aria-hidden="true" />
      </div>
      <div className="flex max-w-lg flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">Google Calendar isn&apos;t configured yet</h2>
        <p className="text-sm text-muted-foreground">
          Whoever runs this server needs to set up a Google OAuth client before anyone can connect a calendar.
        </p>
      </div>
      <Alert className="max-w-lg text-left">
        <AlertTitle>Setup checklist</AlertTitle>
        <AlertDescription>
          <ol className="list-decimal space-y-1.5 pl-4 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-foreground">
            <li>
              Set the <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> environment variables to
              your OAuth client&apos;s credentials.
            </li>
            <li>
              Add <code>{redirectUri}</code> as an authorized redirect URI on that OAuth client.
            </li>
            <li>Enable the Google Calendar API for the associated Google Cloud project.</li>
            <li>
              Publish the OAuth consent screen. An app left in &ldquo;Testing&rdquo; mode issues refresh tokens that
              expire after 7 days, which silently breaks calendar sync for anyone who connected earlier.
            </li>
          </ol>
        </AlertDescription>
      </Alert>
    </div>
  );
}
