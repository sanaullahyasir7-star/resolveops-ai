CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`event_type` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_events_user_created` ON `audit_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_events_incident` ON `audit_events` (`incident_id`);