"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard/settings/profile", label: "Profile" },
  { href: "/dashboard/settings/calendars", label: "Calendars" },
] as const;

/** Small tab strip for the settings section. */
export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings" className="inline-flex w-fit items-center gap-[3px] rounded-lg bg-muted p-[3px]">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1 text-sm font-medium whitespace-nowrap transition-colors outline-none",
              "focus-visible:ring-3 focus-visible:ring-ring/50",
              isActive
                ? "bg-background text-foreground shadow-sm dark:bg-input/30"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
