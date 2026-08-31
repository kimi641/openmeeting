CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`name` text NOT NULL,
	`contact` text,
	`phone` text,
	`note` text,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_organizations_meeting` ON `organizations` (`meeting_id`);--> statement-breakpoint
CREATE TABLE `session_organizers` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`organization_id` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_organizers_organization` ON `session_organizers` (`organization_id`);