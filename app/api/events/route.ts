import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, userIncidents } from "@/db/schema";
import { auditEventSchema, canAccessIncident } from "@/lib/validation";

export const dynamic = "force-dynamic";

async function currentUserId() {
  const requestHeaders = await headers();
  return requestHeaders.get("oai-authenticated-user-id");
}

export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });
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
    if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (Number(request.headers.get("content-length") || 0) > 8000) return Response.json({ error: "Request is too large" }, { status: 413 });
    const rawBody = await request.text();
    if (rawBody.length > 8000) return Response.json({ error: "Request is too large" }, { status: 413 });
    let json: unknown;
    try { json = JSON.parse(rawBody); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
    const parsed = auditEventSchema.safeParse(json);
    if (!parsed.success) return Response.json({ error: "Invalid audit event" }, { status: 400 });
    const body = parsed.data;
    const db = getDb();
    const [incident] = await db.select({ id: userIncidents.id, userId: userIncidents.userId }).from(userIncidents).where(and(eq(userIncidents.id, body.incidentId), eq(userIncidents.userId, userId))).limit(1);
    const seededIds = new Set(["INC-2841", "INC-2838", "INC-2834", "INC-2827"]);
    if ((!incident && !seededIds.has(body.incidentId)) || (incident && !canAccessIncident(userId, incident.userId))) return Response.json({ error: "Incident not found" }, { status: 404 });
    const event = { id: crypto.randomUUID(), userId, incidentId: body.incidentId, eventType: body.eventType, detail: body.detail, createdAt: new Date() };
    await db.insert(auditEvents).values(event);
    return Response.json({ event }, { status: 201 });
  } catch (error) {
    console.error("Unable to save audit event", error);
    return Response.json({ error: "Audit storage is temporarily unavailable" }, { status: 503 });
  }
}
