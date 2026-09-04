import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-background px-6 py-24 text-center">
      <p className="text-sm font-medium tracking-tight text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <Button render={<Link href="/" />}>Go home</Button>
    </div>
  );
}
