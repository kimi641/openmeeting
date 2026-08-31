CREATE TABLE `session_types` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_session_types_meeting` ON `session_types` (`meeting_id`);