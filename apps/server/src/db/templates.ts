import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from './index'
import { sessions, templates, venues } from './schema'

/** 模板数据结构：dayOffset 相对会议起始日，HH:mm 为本地时间（存库时转 ISO UTC） */
export interface TemplateData {
  venues: {
    name: string
    sessions: {
      title: string
      type: 'speech' | 'panel' | 'break' | 'checkin' | 'other'
      dayOffset: number
      startTime: string // HH:mm
      endTime: string // HH:mm
      description?: string
      crossTracks?: boolean
    }[]
  }[]
}

/** 兼容旧模板（v0：tracks 结构）读取 */
interface LegacyTemplateData {
  tracks: TemplateData['venues']
}

const PARTY_COMMITTEE: TemplateData = {
  venues: [
    {
      name: '全体会议',
      sessions: [
        { title: '签到', type: 'checkin', dayOffset: 0, startTime: '09:00', endTime: '09:30', crossTracks: true },
        { title: '开幕致辞', type: 'speech', dayOffset: 0, startTime: '09:30', endTime: '09:45' },
        { title: '议题一：汇报', type: 'speech', dayOffset: 0, startTime: '09:45', endTime: '10:45' },
        { title: '茶歇', type: 'break', dayOffset: 0, startTime: '10:45', endTime: '11:00', crossTracks: true },
        { title: '议题二：汇报', type: 'speech', dayOffset: 0, startTime: '11:00', endTime: '12:00' },
        { title: '午餐休息', type: 'break', dayOffset: 0, startTime: '12:00', endTime: '14:00', crossTracks: true },
        { title: '议题三：讨论', type: 'panel', dayOffset: 0, startTime: '14:00', endTime: '15:30' },
        { title: '总结讲话', type: 'speech', dayOffset: 0, startTime: '15:30', endTime: '16:00' },
      ],
    },
  ],
}

const ANNUAL_FORUM: TemplateData = {
  venues: [
    {
      name: '主会场',
      sessions: [
        { title: '签到', type: 'checkin', dayOffset: 0, startTime: '09:00', endTime: '09:30', crossTracks: true },
        { title: '开幕式', type: 'speech', dayOffset: 0, startTime: '09:30', endTime: '10:00', crossTracks: true },
        { title: '主旨演讲', type: 'speech', dayOffset: 0, startTime: '10:00', endTime: '11:30' },
        { title: '茶歇', type: 'break', dayOffset: 0, startTime: '11:30', endTime: '11:45', crossTracks: true },
        { title: '全体对话：行业趋势', type: 'panel', dayOffset: 0, startTime: '11:45', endTime: '12:30' },
        { title: '午餐休息', type: 'break', dayOffset: 0, startTime: '12:30', endTime: '14:00', crossTracks: true },
        { title: '闭幕圆桌', type: 'panel', dayOffset: 1, startTime: '16:30', endTime: '17:30' },
      ],
    },
    {
      name: '分会场 A',
      sessions: [
        { title: '专题一：技术前沿', type: 'speech', dayOffset: 0, startTime: '14:00', endTime: '15:30' },
        { title: '专题二：落地实践', type: 'speech', dayOffset: 0, startTime: '15:45', endTime: '17:00' },
        { title: '圆桌：生态共建', type: 'panel', dayOffset: 1, startTime: '09:30', endTime: '11:00' },
      ],
    },
    {
      name: '分会场 B',
      sessions: [
        { title: '研讨：合规与安全', type: 'panel', dayOffset: 0, startTime: '14:00', endTime: '15:30' },
        { title: '案例分享', type: 'speech', dayOffset: 0, startTime: '15:45', endTime: '17:00' },
        { title: '工作坊', type: 'other', dayOffset: 1, startTime: '09:30', endTime: '11:30' },
      ],
    },
  ],
}

/** 首启种子：内置"党委会""年会论坛"两套场景模板 */
export function seedTemplates(): void {
  const existing = db.select({ id: templates.id }).from(templates).all()
  if (existing.length > 0) {
    // 旧版本种子使用 tracks 结构，升级为 venues 结构
    for (const tpl of existing) {
      const row = db.select().from(templates).where(eq(templates.id, tpl.id)).get()
      if (!row) continue
      try {
        const data = JSON.parse(row.dataJson) as TemplateData | LegacyTemplateData
        if ('tracks' in data && data.tracks) {
          db.update(templates)
            .set({ dataJson: JSON.stringify({ venues: data.tracks }) })
            .where(eq(templates.id, tpl.id))
            .run()
        }
      } catch {
        // 解析失败保持原样
      }
    }
    return
  }

  const now = new Date().toISOString()
  db.insert(templates)
    .values([
      { id: 'tpl-party', name: '党委会', scenarioType: 'small', dataJson: JSON.stringify(PARTY_COMMITTEE), createdAt: now },
      { id: 'tpl-forum', name: '年会论坛', scenarioType: 'medium', dataJson: JSON.stringify(ANNUAL_FORUM), createdAt: now },
    ])
    .run()
  console.log('[init] 已内置场景模板：党委会、年会论坛')
}

/** 将模板预填为会议的场地与场次骨架（会议内同名场地复用已有记录） */
export function applyTemplate(templateId: string, meetingId: string, meetingStartDate: string): void {
  const tpl = db.select().from(templates).where(eq(templates.id, templateId)).get()
  if (!tpl) return

  let data: TemplateData
  try {
    const parsed = JSON.parse(tpl.dataJson) as TemplateData | LegacyTemplateData
    data = 'venues' in parsed && parsed.venues ? parsed : { venues: (parsed as LegacyTemplateData).tracks ?? [] }
  } catch {
    return
  }

  const base = new Date(`${meetingStartDate}T00:00:00`)
  if (Number.isNaN(base.getTime())) return

  db.transaction((tx) => {
    let sessionOrder = 0
    let venueOrder = 0
    for (const v of data.venues) {
      // 会议内同名场地复用，避免重复创建
      let venueId = tx
        .select({ id: venues.id })
        .from(venues)
        .where(and(eq(venues.meetingId, meetingId), eq(venues.name, v.name)))
        .get()?.id
      if (!venueId) {
        venueId = nanoid(12)
        tx.insert(venues)
          .values({ id: venueId, meetingId, name: v.name, sortOrder: venueOrder++ })
          .run()
      }

      for (const s of v.sessions) {
        const [sh, sm] = s.startTime.split(':').map(Number)
        const [eh, em] = s.endTime.split(':').map(Number)
        const start = new Date(base)
        start.setDate(start.getDate() + s.dayOffset)
        start.setHours(sh ?? 0, sm ?? 0, 0, 0)
        const end = new Date(start)
        end.setHours(eh ?? 0, em ?? 0, 0, 0)

        tx.insert(sessions)
          .values({
            id: nanoid(12),
            meetingId,
            venueId,
            title: s.title,
            type: s.type,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            description: s.description ?? null,
            sortOrder: sessionOrder++,
            crossTracks: s.crossTracks ?? false,
          })
          .run()
      }
    }
  })
}
