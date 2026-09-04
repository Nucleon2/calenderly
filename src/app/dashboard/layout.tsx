import { requireOnboardedUser } from "@/server/auth/session";
import { env } from "@/lib/env";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireOnboardedUser();

  return (
    <DashboardShell
      user={{
        name: user.name,
        email: user.email,
        image: user.image,
        username: user.username ?? null,
      }}
      appUrl={env.APP_URL}
    >
      {children}
    </DashboardShell>
  );
}
