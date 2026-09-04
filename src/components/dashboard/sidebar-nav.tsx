"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, CalendarRange, Clock, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard/event-types", label: "Event types", icon: CalendarRange },
  { href: "/dashboard/bookings", label: "Bookings", icon: CalendarClock },
  { href: "/dashboard/availability", label: "Availability", icon: Clock },
  { href: "/dashboard/settings/profile", label: "Settings", icon: Settings },
] as const;

type SidebarNavProps = {
  onNavigate?: () => void;
  className?: string;
};

export function SidebarNav({ onNavigate, className }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-1", className)}>
      {navItems.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard/settings/profile" && pathname.startsWith(`${item.href}/`)) ||
          (item.href === "/dashboard/settings/profile" && pathname.startsWith("/dashboard/settings"));
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none",
              "focus-visible:ring-3 focus-visible:ring-ring/50",
              isActive
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
