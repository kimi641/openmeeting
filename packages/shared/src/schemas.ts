import { z } from 'zod'

// ---------- 枚举 ----------

export const MeetingStatusEnum = z.enum(['draft', 'published', 'ongoing', 'finished'])
export type MeetingStatus = z.infer<typeof MeetingStatusEnum>

export const SessionTypeEnum = z.enum(['speech', 'panel', 'break', 'checkin', 'other'])
export type SessionType = z.infer<typeof SessionTypeEnum>

export const SpeakerRoleEnum = z.enum(['host', 'speaker', 'panelist'])
export type SpeakerRole = z.infer<typeof SpeakerRoleEnum>

export const ConfirmStatusEnum = z.enum(['pending', 'confirmed', 'declined'])
export type ConfirmStatus = z.infer<typeof ConfirmStatusEnum>

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
const isoDatetime = z.iso.datetime({ offset: true })

// ---------- 认证 ----------

export const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空').max(100),
  password: z.string().min(1, '密码不能为空').max(200),
})
export type LoginInput = z.infer<typeof loginSchema>

// ---------- 会议 ----------

export const createMeetingSchema = z.object({
  name: z.string().min(1, '会议名称不能为空').max(200),
  description: z.string().max(2000).nullable().optional(),
  startDate: dateStr,
  endDate: dateStr,
  location: z.string().max(200).nullable().optional(),
  templateId: z.string().max(64).optional(),
}).refine((v) => v.endDate >= v.startDate, { message: '结束日期不能早于开始日期', path: ['endDate'] })
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>

export const updateMeetingSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  startDate: dateStr.optional(),
  endDate: dateStr.optional(),
  location: z.string().max(200).nullable().optional(),
}).refine((v) => {
  if (v.startDate && v.endDate) return v.endDate >= v.startDate
  return true
}, { message: '结束日期不能早于开始日期', path: ['endDate'] })
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>

export const meetingStatusSchema = z.object({ status: MeetingStatusEnum })
export type MeetingStatusInput = z.infer<typeof meetingStatusSchema>

// ---------- 场次（session） ----------

export const createSessionSchema = z
  .object({
    venueId: z.string().max(64).nullable().optional(),
    title: z.string().min(1, '场次标题不能为空').max(200),
    type: SessionTypeEnum.default('other'),
    startTime: isoDatetime,
    endTime: isoDatetime,
    description: z.string().max(2000).nullable().optional(),
    sortOrder: z.number().int().optional(),
    crossTracks: z.boolean().optional(),
    speakers: z
      .array(
        z.object({
          participantId: z.string().min(1),
          role: SpeakerRoleEnum.default('speaker'),
        }),
      )
      .optional(),
  })
  .refine((v) => v.endTime > v.startTime, { message: '结束时间必须晚于开始时间', path: ['endTime'] })
export type CreateSessionInput = z.infer<typeof createSessionSchema>

export const updateSessionSchema = z
  .object({
    venueId: z.string().max(64).nullable().optional(),
    title: z.string().min(1).max(200).optional(),
    type: SessionTypeEnum.optional(),
    startTime: isoDatetime.optional(),
    endTime: isoDatetime.optional(),
    description: z.string().max(2000).nullable().optional(),
    sortOrder: z.number().int().optional(),
    crossTracks: z.boolean().optional(),
  })
  .refine((v) => {
    if (v.startTime && v.endTime) return v.endTime > v.startTime
    return true
  }, { message: '结束时间必须晚于开始时间', path: ['endTime'] })
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>

export const moveSessionSchema = z
  .object({
    venueId: z.string().max(64).nullable(),
    startTime: isoDatetime,
    endTime: isoDatetime,
    sortOrder: z.number().int().optional(),
  })
  .refine((v) => v.endTime > v.startTime, { message: '结束时间必须晚于开始时间', path: ['endTime'] })
export type MoveSessionInput = z.infer<typeof moveSessionSchema>

// ---------- 场地（会议级资源） ----------

export const createVenueSchema = z.object({
  meetingId: z.string().min(1, '缺少会议 ID'),
  name: z.string().min(1, '场地名称不能为空').max(200),
  capacity: z.number().int().positive('容量应为正整数').optional(),
  equipment: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
})
export type CreateVenueInput = z.infer<typeof createVenueSchema>

export const updateVenueSchema = createVenueSchema.partial()
export type UpdateVenueInput = z.infer<typeof updateVenueSchema>

/** 日历场地列拖拽排序 */
export const reorderVenuesSchema = z.object({
  venueIds: z.array(z.string().min(1)).min(1, '场地列表不能为空'),
})
export type ReorderVenuesInput = z.infer<typeof reorderVenuesSchema>

// ---------- 人员（会议级资源） ----------

export const createParticipantSchema = z.object({
  meetingId: z.string().min(1, '缺少会议 ID'),
  name: z.string().min(1, '姓名不能为空').max(100),
  orgName: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  email: z.union([z.email('邮箱格式不正确'), z.literal('')]).optional(),
  note: z.string().max(1000).optional(),
})
export type CreateParticipantInput = z.infer<typeof createParticipantSchema>

export const updateParticipantSchema = createParticipantSchema.partial()
export type UpdateParticipantInput = z.infer<typeof updateParticipantSchema>

// ---------- 场次嘉宾 ----------

export const addSpeakerSchema = z.object({
  participantId: z.string().min(1),
  role: SpeakerRoleEnum.default('speaker'),
  confirmStatus: ConfirmStatusEnum.default('pending'),
})
export type AddSpeakerInput = z.infer<typeof addSpeakerSchema>

export const updateSpeakerSchema = z.object({
  role: SpeakerRoleEnum.optional(),
  confirmStatus: ConfirmStatusEnum.optional(),
})
export type UpdateSpeakerInput = z.infer<typeof updateSpeakerSchema>

// ---------- 会议参会人 ----------

export const addMeetingParticipantSchema = z.object({
  participantId: z.string().min(1),
  meetingRole: z.string().max(50).optional(),
})
export type AddMeetingParticipantInput = z.infer<typeof addMeetingParticipantSchema>
