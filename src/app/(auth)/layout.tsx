import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center gap-8 bg-muted px-4 py-12">
      <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
        Scheduler
      </Link>
      {children}
    </div>
  );
}
