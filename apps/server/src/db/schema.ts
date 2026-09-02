import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// ---------- 用户与会话 ----------

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
})

export const authSessions = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
})

// ---------- 会议与日程 ----------

export const meetings = sqliteTable('meetings', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  location: text('location'),
  status: text('status', {
    enum: ['draft', 'published', 'ongoing', 'finished'],
  })
    .notNull()
    .default('draft'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const venues = sqliteTable(
  'venues',
  {
    id: text('id').primaryKey(),
    /** 场地是会议级资源（日历列按会议独立） */
    meetingId: text('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    capacity: integer('capacity'),
    equipment: text('equipment'),
    note: text('note'),
    /** 日历列顺序（拖拽排序持久化） */
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('idx_venues_meeting').on(t.meetingId)],
)

/** 场次活动类型（会议级资源）：内置类型惰性 seed + 用户自定义 */
export const sessionTypes = sqliteTable(
  'session_types',
  {
    id: text('id').primaryKey(),
    meetingId: text('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    /** 类型 key：内置沿用 speech/panel/...（兼容存量数据），自定义用 nanoid */
    key: text('key').notNull(),
    name: text('name').notNull(),
    /** 十六进制颜色（#RRGGBB） */
    color: text('color').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('idx_session_types_meeting').on(t.meetingId)],
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    meetingId: text('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    venueId: text('venue_id').references(() => venues.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    /** 活动类型 key（session_types.key；存量内置值直接兼容） */
    type: text('type').notNull().default('other'),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    /** 全体环节：跨场地（日历中横跨整行显示） */
    crossTracks: integer('cross_tracks', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('idx_sessions_meeting_start').on(t.meetingId, t.startTime)],
)

// ---------- 人员 ----------

export const participants = sqliteTable(
  'participants',
  {
    id: text('id').primaryKey(),
    /** 通讯录是会议级资源 */
    meetingId: text('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    orgName: text('org_name'),
    title: text('title'),
    phone: text('phone'),
    email: text('email'),
    note: text('note'),
  },
  (t) => [index('idx_participants_meeting').on(t.meetingId)],
)

export const sessionSpeakers = sqliteTable(
  'session_speakers',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    participantId: text('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['host', 'speaker', 'panelist'] }).notNull().default('speaker'),
    confirmStatus: text('confirm_status', {
      enum: ['pending', 'confirmed', 'declined'],
    })
      .notNull()
      .default('pending'),
  },
  (t) => [index('idx_speakers_participant').on(t.participantId)],
)

export const meetingParticipants = sqliteTable('meeting_participants', {
  id: text('id').primaryKey(),
  meetingId: text('meeting_id')
    .notNull()
    .references(() => meetings.id, { onDelete: 'cascade' }),
  participantId: text('participant_id')
    .notNull()
    .references(() => participants.id, { onDelete: 'cascade' }),
  meetingRole: text('meeting_role'),
})

// ---------- 组织与主办方 ----------

export const organizations = sqliteTable(
  'organizations',
  {
    id: text('id').primaryKey(),
    /** 组织是会议级资源 */
    meetingId: text('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    contact: text('contact'),
    phone: text('phone'),
    note: text('note'),
  },
  (t) => [index('idx_organizations_meeting').on(t.meetingId)],
)

export const sessionOrganizers = sqliteTable(
  'session_organizers',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
  },
  (t) => [index('idx_organizers_organization').on(t.organizationId)],
)

// ---------- 材料 ----------

export const materials = sqliteTable('materials', {
  id: text('id').primaryKey(),
  meetingId: text('meeting_id')
    .notNull()
    .references(() => meetings.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  storedPath: text('stored_path').notNull(),
  size: integer('size').notNull(),
  mime: text('mime'),
  uploadedBy: text('uploaded_by').references(() => users.id),
  createdAt: text('created_at').notNull(),
})

// ---------- 导入与模板 ----------

export const importPresets = sqliteTable('import_presets', {
  id: text('id').primaryKey(),
  importType: text('import_type').notNull(),
  name: text('name').notNull(),
  mappingJson: text('mapping_json').notNull(),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').notNull(),
})

export const templates = sqliteTable('templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  scenarioType: text('scenario_type', { enum: ['small', 'medium'] }).notNull(),
  dataJson: text('data_json').notNull(),
  createdAt: text('created_at').notNull(),
})

// ---------- 系统设置 ----------

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// ---------- LLM 端点（占位）与审计 ----------

export const llmEndpoints = sqliteTable('llm_endpoints', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  baseUrl: text('base_url').notNull(),
  apiKeyEnc: text('api_key_enc'),
  model: text('model'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
})

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  detailJson: text('detail_json'),
  createdAt: text('created_at').notNull(),
})
