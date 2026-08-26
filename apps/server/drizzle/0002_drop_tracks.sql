-- 去掉日程线（track）：场次直接归属会议并绑定场地，日历列 = 场地
-- 存量数据：sessions 继承原所属 track 的 meetingId / venueId，然后删除 tracks 表

ALTER TABLE sessions ADD COLUMN meeting_id text REFERENCES meetings(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN venue_id text REFERENCES venues(id) ON DELETE set null;--> statement-breakpoint

-- 场次归属会议：由原 track 反查
UPDATE sessions SET meeting_id = (
  SELECT t.meeting_id FROM tracks t WHERE t.id = sessions.track_id
);--> statement-breakpoint

-- 场次场地：继承 track 的绑定
UPDATE sessions SET venue_id = (
  SELECT t.venue_id FROM tracks t WHERE t.id = sessions.track_id
);--> statement-breakpoint

-- 重建 sessions 表：meeting_id 收紧为 NOT NULL 并移除 track_id
CREATE TABLE `sessions_new` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`venue_id` text,
	`title` text NOT NULL,
	`type` text DEFAULT 'other' NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`cross_tracks` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON DELETE cascade,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON DELETE set null
);--> statement-breakpoint
INSERT INTO `sessions_new` (`id`, `meeting_id`, `venue_id`, `title`, `type`, `start_time`, `end_time`, `description`, `sort_order`, `cross_tracks`)
SELECT `id`, `meeting_id`, `venue_id`, `title`, `type`, `start_time`, `end_time`, `description`, `sort_order`, `cross_tracks` FROM `sessions`;--> statement-breakpoint

DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `sessions_new` RENAME TO `sessions`;--> statement-breakpoint
CREATE INDEX `idx_sessions_meeting_start` ON `sessions` (`meeting_id`,`start_time`);--> statement-breakpoint

DROP TABLE `tracks`;