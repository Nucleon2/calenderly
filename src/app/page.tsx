import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getSession } from "@/server/auth/session";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-24">
      <div className="flex w-full max-w-2xl flex-col items-center gap-6 text-center">
        <span className="text-sm font-medium tracking-tight text-muted-foreground">
          Scheduler
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Scheduling you can self-host
        </h1>
        <p className="max-w-md text-lg leading-8 text-muted-foreground">
          Share a booking page, set your availability, and let people schedule time
          with you — all on infrastructure you own.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button nativeButton={false} render={<Link href="/sign-in" />} size="lg">
            Sign in
          </Button>
          <Button nativeButton={false} render={<Link href="/sign-up" />} size="lg" variant="outline">
            Create account
          </Button>
        </div>
      </div>
    </div>
  );
}
