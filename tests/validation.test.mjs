import test from "node:test";
import assert from "node:assert/strict";
import {
  analysisOutputSchema,
  auditEventSchema,
  canAccessIncident,
  createIncidentSchema,
  incidentAnalysisInputSchema,
  retainQuotedEvidence,
} from "../lib/validation.ts";

test("incident creation enforces size and rejects unexpected fields", () => {
  assert.equal(createIncidentSchema.safeParse({ description: "  Payment requests are failing  " }).success, true);
  assert.equal(createIncidentSchema.safeParse({ description: "short" }).success, false);
  assert.equal(createIncidentSchema.safeParse({ description: "A sufficiently long report", admin: true }).success, false);
  assert.equal(createIncidentSchema.safeParse({ description: "x".repeat(4001) }).success, false);
});

test("audit events allow only known, bounded event payloads", () => {
  assert.equal(auditEventSchema.safeParse({ incidentId: "INC-1", eventType: "actions.approved", detail: "Reviewed" }).success, true);
  assert.equal(auditEventSchema.safeParse({ incidentId: "INC-1", eventType: "actions.executed", detail: "Run it" }).success, false);
  assert.equal(auditEventSchema.safeParse({ incidentId: "INC-1", eventType: "analysis.failed", detail: "x".repeat(2001) }).success, false);
});

test("analysis input is bounded and rejects unknown severity and extra fields", () => {
  const valid = { id: "INC-1", title: "Payment errors", customer: "Example", severity: "high", source: "Manual", summary: "Requests fail after deployment", evidence: [{ source: "report", detail: "Requests fail after deployment" }] };
  assert.equal(incidentAnalysisInputSchema.safeParse(valid).success, true);
  assert.equal(incidentAnalysisInputSchema.safeParse({ ...valid, severity: "urgent" }).success, false);
  assert.equal(incidentAnalysisInputSchema.safeParse({ ...valid, untrustedAdmin: true }).success, false);
});

test("model output schema bounds confidence and requires actions and evidence", () => {
  const valid = { summary: "A possible failure.", confidence: 42, evidence: [{ source: "report", detail: "Requests fail", relevance: 80 }], actions: ["Inspect deployment"] };
  assert.equal(analysisOutputSchema.safeParse(valid).success, true);
  assert.equal(analysisOutputSchema.safeParse({ ...valid, confidence: 101 }).success, false);
  assert.equal(analysisOutputSchema.safeParse({ ...valid, evidence: [] }).success, false);
});

test("evidence retention drops sources and excerpts not present in supplied evidence", () => {
  const supplied = [{ source: "report", detail: "Requests fail after deployment" }];
  const proposed = [
    { source: "report", detail: "Requests fail" },
    { source: "invented.log", detail: "CPU reached 100%" },
    { source: "report", detail: "CPU reached 100%" },
  ];
  assert.deepEqual(retainQuotedEvidence(proposed, supplied), [proposed[0]]);
});

test("incident access requires the authenticated user to match the owner", () => {
  assert.equal(canAccessIncident("user-a", "user-a"), true);
  assert.equal(canAccessIncident("user-a", "user-b"), false);
  assert.equal(canAccessIncident(null, "user-a"), false);
  assert.equal(canAccessIncident("user-a", null), false);
});
