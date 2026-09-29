import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, userIncidents } from "@/db/schema";

export const dynamic = "force-dynamic";

async function currentUserId() {
  const requestHeaders = await headers();
  return requestHeaders.get("oai-authenticated-user-id") ?? "local-demo-user";
}

export async function GET() {
  try {
    const userId = await currentUserId();
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
    const body = await request.json() as { description?: string; customer?: string };
    const description = body.description?.trim();
    if (!description || description.length < 12) return Response.json({ error: "Describe the incident in at least 12 characters" }, { status: 400 });
    const firstLine = description.split(/[.!?\n]/)[0].trim();
    const incident = {
      id: `INC-${crypto.randomUUID().slice(0, 4).toUpperCase()}`,
      userId,
      title: firstLine.slice(0, 72) || "New operational incident",
      description: description.slice(0, 4000),
      customer: body.customer?.trim().slice(0, 100) || "Internal report",
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
