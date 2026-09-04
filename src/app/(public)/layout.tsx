import Link from "next/link";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-10 sm:py-16">{children}</main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Powered by{" "}
        <Link href="/" className="font-medium text-foreground hover:underline">
          Scheduler
        </Link>
      </footer>
    </div>
  );
}
