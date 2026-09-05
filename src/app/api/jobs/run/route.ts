import { timingSafeEqual } from "node:crypto";
import { drainQueues } from "@/server/jobs/drain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Drains the reminder and calendar-sync queues once. Meant to be hit by a scheduler
 * (Vercel Cron, cron-job.org, a systemd timer, ...) on serverless hosts where the
 * background pg-boss workers can't stay alive. Authenticated with `CRON_SECRET`, sent either as
 * `Authorization: Bearer <secret>` (what Vercel Cron does) or `?secret=<secret>`.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json(
      { error: "CRON_SECRET is not set; refusing to run jobs over HTTP" },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : (url.searchParams.get("secret") ?? "");
  if (!safeEqual(provided, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await drainQueues({ budgetMs: 45_000 });
    return Response.json({ status: "ok", ...result });
  } catch (error) {
    console.error("[jobs] drain failed", error);
    return Response.json({ status: "error" }, { status: 500 });
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
