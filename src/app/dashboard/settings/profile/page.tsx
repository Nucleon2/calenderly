import type { Metadata } from "next";
import { requireOnboardedUser } from "@/server/auth/session";
import { env } from "@/lib/env";
import { ProfileForm } from "@/components/settings/profile-form";

export const metadata: Metadata = {
  title: "Profile settings",
};

export default async function ProfileSettingsPage() {
  const user = await requireOnboardedUser();
  const urlPrefix = `${env.APP_URL.replace(/^https?:\/\//, "")}/`;
  const publicUrl = `${env.APP_URL}/${user.username}`;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Manage the details people see on your public booking page.
        </p>
      </div>
      <ProfileForm
        defaultName={user.name}
        defaultUsername={user.username ?? ""}
        defaultTimezone={user.timezone ?? "UTC"}
        defaultWelcomeText={user.welcomeText ?? ""}
        defaultWeekStart={(user.weekStart ?? 0) as 0 | 1 | 6}
        defaultImage={user.image ?? ""}
        urlPrefix={urlPrefix}
        publicUrl={publicUrl}
      />
    </div>
  );
}
