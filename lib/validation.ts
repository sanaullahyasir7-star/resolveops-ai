import { z } from "zod";

export const createIncidentSchema = z.object({
  description: z.string().trim().min(12).max(4000),
  customer: z.string().trim().max(100).optional(),
}).strict();

export const auditEventSchema = z.object({
  incidentId: z.string().min(1).max(80),
  eventType: z.enum(["incident.created", "analysis.completed", "analysis.demo", "analysis.failed", "actions.approved", "actions.rejected"]),
  detail: z.string().min(1).max(2000),
}).strict();

export const incidentAnalysisInputSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().max(240),
  customer: z.string().max(120),
  severity: z.enum(["critical", "high", "medium", "low"]),
  source: z.string().max(120),
  summary: z.string().min(1).max(5000),
  evidence: z.array(z.object({
    source: z.string().min(1).max(120),
    detail: z.string().min(1).max(1000),
    relevance: z.number().min(0).max(100).optional(),
  }).strict()).max(8),
}).strict();

export const analysisOutputSchema = z.object({
  summary: z.string().min(1).max(900),
  confidence: z.number().int().min(0).max(100),
  evidence: z.array(z.object({
    source: z.string().min(1).max(120),
    detail: z.string().min(1).max(500),
    relevance: z.number().int().min(0).max(100),
  }).strict()).min(1).max(5),
  actions: z.array(z.string().min(1).max(240)).min(1).max(5),
}).strict();

export function canAccessIncident(authenticatedUserId: string | null, ownerUserId: string | null) {
  return Boolean(authenticatedUserId && ownerUserId && authenticatedUserId === ownerUserId);
}

export function retainQuotedEvidence<T extends { source: string; detail: string }>(
  proposed: T[],
  supplied: Array<{ source: string; detail: string }>,
) {
  const sources = new Map(supplied.map((item) => [item.source, item.detail]));
  return proposed.filter((item) => sources.get(item.source)?.includes(item.detail));
}
