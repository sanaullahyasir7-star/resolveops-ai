import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, userIncidents } from "@/db/schema";
import { createIncidentSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

async function currentUserId() {
  const requestHeaders = await headers();
  return requestHeaders.get("oai-authenticated-user-id");
}

export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });
    const incidents = await getDb().select().from(userIncidents).where(eq(userIncidents.userId, userId)).orderBy(desc(userIncidents.createdAt)).limit(50);
    return Response.json({ incidents });
  } catch (error) {
    console.error("Unable to read incidents", error);
    return Response.json({ incidents: [], unavailable: true }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (Number(request.headers.get("content-length") || 0) > 12_000) return Response.json({ error: "Request is too large" }, { status: 413 });
    const rawBody = await request.text();
    if (rawBody.length > 12_000) return Response.json({ error: "Request is too large" }, { status: 413 });
    let json: unknown;
    try { json = JSON.parse(rawBody); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
    const parsed = createIncidentSchema.safeParse(json);
    if (!parsed.success) return Response.json({ error: "Invalid incident. Description must be 12–4000 characters; customer is limited to 100." }, { status: 400 });
    const { description, customer } = parsed.data;
    const firstLine = description.split(/[.!?\n]/)[0].trim();
    const incident = {
      id: `INC-${crypto.randomUUID().toUpperCase()}`,
      userId,
      title: firstLine.slice(0, 72) || "New operational incident",
      description: description.slice(0, 4000),
      customer: customer || "Internal report",
      severity: "medium",
      status: "Investigating",
      createdAt: new Date(),
    };
    const audit = { id: crypto.randomUUID(), userId, incidentId: incident.id, eventType: "incident.created", detail: incident.description, createdAt: new Date() };
    await getDb().batch([getDb().insert(userIncidents).values(incident), getDb().insert(auditEvents).values(audit)]);
    return Response.json({ incident }, { status: 201 });
  } catch (error) {
    console.error("Unable to create incident", error);
    return Response.json({ error: "Incident storage is temporarily unavailable" }, { status: 503 });
  }
}
