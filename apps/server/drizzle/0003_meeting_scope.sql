-- 场地与通讯录改为会议级资源：venues/participants 挂到会议，venues 增加排序列
-- 存量数据：复制到每个现有会议（副本 id = 原id:会议id），场次/嘉宾/会议人员引用重写为所属会议的副本，原全局行删除

ALTER TABLE venues ADD COLUMN meeting_id text REFERENCES meetings(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE venues ADD COLUMN sort_order integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE participants ADD COLUMN meeting_id text REFERENCES meetings(id) ON DELETE cascade;--> statement-breakpoint

-- 场地复制到所有会议
INSERT INTO venues (id, meeting_id, name, capacity, equipment, note, sort_order)
SELECT v.id || ':' || m.id, m.id, v.name, v.capacity, v.equipment, v.note, v.sort_order
FROM venues v CROSS JOIN meetings m;--> statement-breakpoint

-- 场次的场地引用重写为所属会议的副本
UPDATE sessions SET venue_id = venue_id || ':' || meeting_id WHERE venue_id IS NOT NULL;--> statement-breakpoint

-- 人员复制到所有会议
INSERT INTO participants (id, meeting_id, name, org_name, title, phone, email, note)
SELECT p.id || ':' || m.id, m.id, p.name, p.org_name, p.title, p.phone, p.email, p.note
FROM participants p CROSS JOIN meetings m;--> statement-breakpoint

-- 场次嘉宾的人员引用重写（通过场次反查所属会议）
UPDATE session_speakers SET participant_id = participant_id || ':' || (
  SELECT s.meeting_id FROM sessions s WHERE s.id = session_speakers.session_id
);--> statement-breakpoint

-- 会议人员关联重写
UPDATE meeting_participants SET participant_id = participant_id || ':' || meeting_id;--> statement-breakpoint

-- 删除全局旧行（引用已全部重写）
DELETE FROM venues WHERE meeting_id IS NULL;--> statement-breakpoint
DELETE FROM participants WHERE meeting_id IS NULL;--> statement-breakpoint

CREATE INDEX idx_venues_meeting ON venues (meeting_id);--> statement-breakpoint
CREATE INDEX idx_participants_meeting ON participants (meeting_id);
