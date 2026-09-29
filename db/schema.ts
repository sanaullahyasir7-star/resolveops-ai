import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  incidentId: text("incident_id").notNull(),
  eventType: text("event_type").notNull(),
  detail: text("detail").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_audit_events_user_created").on(table.userId, table.createdAt),
  index("idx_audit_events_incident").on(table.incidentId),
]);

export const userIncidents = sqliteTable("user_incidents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  customer: text("customer").notNull().default("Internal report"),
  severity: text("severity").notNull().default("medium"),
  status: text("status").notNull().default("Investigating"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_user_incidents_user_created").on(table.userId, table.createdAt),
]);
