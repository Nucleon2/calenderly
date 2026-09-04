"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserMenu } from "@/components/dashboard/user-menu";

type DashboardShellUser = {
  name: string;
  email: string;
  image?: string | null;
  username: string | null;
};

type DashboardShellProps = {
  user: DashboardShellUser;
  appUrl: string;
  children: React.ReactNode;
};

export function DashboardShell({ user, appUrl, children }: DashboardShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-background md:flex">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Link href="/dashboard" className="text-base font-semibold tracking-tight text-foreground">
            Scheduler
          </Link>
        </div>
        <div className="flex flex-1 flex-col justify-between overflow-y-auto p-3">
          <SidebarNav />
          <UserMenu user={user} appUrl={appUrl} className="mt-3" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 md:hidden">
          <Link href="/dashboard" className="text-base font-semibold tracking-tight text-foreground">
            Scheduler
          </Link>
          <div className="flex items-center gap-2">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
                <Menu />
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-b border-border">
                  <SheetTitle>Scheduler</SheetTitle>
                  <SheetDescription className="sr-only">Dashboard navigation</SheetDescription>
                </SheetHeader>
                <div className="flex flex-1 flex-col justify-between overflow-y-auto p-3">
                  <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
                  <UserMenu user={user} appUrl={appUrl} className="mt-3" />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
