import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents } from "@/db/schema";

export const dynamic = "force-dynamic";

async function currentUserId() {
  const requestHeaders = await headers();
  return requestHeaders.get("oai-authenticated-user-id") ?? "local-demo-user";
}

export async function GET() {
  try {
    const userId = await currentUserId();
    const events = await getDb().select().from(auditEvents).where(eq(auditEvents.userId, userId)).orderBy(desc(auditEvents.createdAt)).limit(30);
    return Response.json({ events });
  } catch (error) {
    console.error("Unable to read audit events", error);
    return Response.json({ events: [], unavailable: true }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await currentUserId();
    const body = await request.json() as { incidentId?: string; eventType?: string; detail?: string };
    if (!body.incidentId || !body.eventType || !body.detail) return Response.json({ error: "Missing event data" }, { status: 400 });
    const event = { id: crypto.randomUUID(), userId, incidentId: body.incidentId.slice(0, 80), eventType: body.eventType.slice(0, 60), detail: body.detail.slice(0, 2000), createdAt: new Date() };
    await getDb().insert(auditEvents).values(event);
    return Response.json({ event }, { status: 201 });
  } catch (error) {
    console.error("Unable to save audit event", error);
    return Response.json({ error: "Audit storage is temporarily unavailable" }, { status: 503 });
  }
}
