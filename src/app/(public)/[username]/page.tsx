import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { isReservedUsername } from "@/lib/reserved-usernames";
import { getPublicProfileByUsername } from "@/server/users/service";
import { listPublicEventTypes } from "@/server/event-types/service";

type PublicProfilePageProps = {
  params: Promise<{ username: string }>;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

async function loadProfile(username: string) {
  if (isReservedUsername(username)) return null;
  return getPublicProfileByUsername(username);
}

export async function generateMetadata({ params }: PublicProfilePageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await loadProfile(username);
  if (!profile) return {};
  return { title: profile.name };
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { username } = await params;
  const profile = await loadProfile(username);
  if (!profile) notFound();

  const eventTypes = await listPublicEventTypes(profile.username);

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar size="lg">
          <AvatarImage src={profile.image ?? undefined} alt="" />
          <AvatarFallback>{initials(profile.name)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{profile.name}</h1>
          {profile.welcomeText && (
            <p className="max-w-md text-sm text-muted-foreground">{profile.welcomeText}</p>
          )}
        </div>
      </div>

      <div className="flex w-full max-w-lg flex-col gap-3">
        {eventTypes.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            {profile.name} doesn&apos;t have any event types available right now.
          </p>
        )}
        {eventTypes.map((eventType) => (
          <Link key={eventType.id} href={`/${profile.username}/${eventType.slug}`} className="group block">
            <Card className="p-4 ring-foreground/10 transition-colors group-hover:ring-foreground/20">
              <div className="flex flex-col gap-1">
                <span
                  className="h-1 w-8 rounded-full"
                  style={{ backgroundColor: eventType.color }}
                  aria-hidden="true"
                />
                <span className="text-sm font-medium text-foreground">{eventType.title}</span>
                {eventType.description && (
                  <span className="line-clamp-2 text-sm text-muted-foreground">{eventType.description}</span>
                )}
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3.5" />
                  {eventType.durationMinutes} min
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
