CREATE TABLE `availability_rules` (
	`weekday` integer PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`start_time` text DEFAULT '09:00' NOT NULL,
	`end_time` text DEFAULT '17:00' NOT NULL,
	`slot_minutes` integer DEFAULT 30 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`company` text,
	`phone` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_email_unique` ON `profiles` (`email`);--> statement-breakpoint
CREATE INDEX `idx_documents_owner_created` ON `documents` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_invoices_client_created` ON `invoices` (`client_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_submissions_owner_created` ON `submissions` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_submissions_booking` ON `submissions` (`preferred_date`,`preferred_time`);