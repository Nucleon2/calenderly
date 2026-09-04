import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", db: "ok", time: new Date().toISOString() });
  } catch (error) {
    console.error("[health] database check failed", error);
    return Response.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
