import { and, asc, count, desc, eq, like, or } from 'drizzle-orm'
import ExcelJS from 'exceljs'
import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import {
  createMeetingSchema,
  detectConflicts,
  meetingStatusSchema,
  updateMeetingSchema,
  type ConflictSession,
  type ConflictSpeaker,
} from '@meeting/shared'
import { db } from '../db'
import { meetings, participants, sessionSpeakers, sessions, venues } from '../db/schema'
import { requireAuth, type AppEnv } from '../lib/auth'
import { notFound } from '../lib/http'
import { applyTemplate } from '../db/templates'

const meetingsRouter = new Hono<AppEnv>()
meetingsRouter.use('*', requireAuth)

function getMeetingOr404(id: string) {
  const meeting = db.select().from(meetings).where(eq(meetings.id, id)).get()
  if (!meeting) throw notFound('会议')
  return meeting
}

// 会议列表：?status=&keyword=&page=&pageSize=
meetingsRouter.get('/', (c) => {
  const page = Math.max(1, Number(c.req.query('page') ?? 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 20) || 20))
  const status = c.req.query('status')
  const keyword = c.req.query('keyword')?.trim()

  const conditions = []
  if (
    status === 'draft' ||
    status === 'published' ||
    status === 'ongoing' ||
    status === 'finished'
  ) {
    conditions.push(eq(meetings.status, status))
  }
  if (keyword) {
    conditions.push(or(like(meetings.name, `%${keyword}%`), like(meetings.location, `%${keyword}%`))!)
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const total = db.select({ n: count() }).from(meetings).where(where).get()?.n ?? 0
  const data = db
    .select()
    .from(meetings)
    .where(where)
    .orderBy(desc(meetings.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()

  return c.json({ data, total, page, pageSize })
})

// 新建会议（可选场景模板）
meetingsRouter.post('/', async (c) => {
  const input = createMeetingSchema.parse(await c.req.json())
  const now = new Date().toISOString()
  const id = nanoid(12)

  db.insert(meetings)
    .values({
      id,
      name: input.name,
      description: input.description ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
      location: input.location ?? null,
      status: 'draft',
      createdBy: c.get('user').id,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  if (input.templateId) {
    applyTemplate(input.templateId, id, input.startDate)
  }

  return c.json(getMeetingOr404(id), 201)
})

// 会议详情 + 统计
meetingsRouter.get('/:id', (c) => {
  const meeting = getMeetingOr404(c.req.param('id'))
  const sessionCount =
    db.select({ n: count() }).from(sessions).where(eq(sessions.meetingId, meeting.id)).get()?.n ?? 0
  return c.json({ ...meeting, stats: { sessions: sessionCount } })
})

// 更新会议基本信息
meetingsRouter.patch('/:id', async (c) => {
  const meeting = getMeetingOr404(c.req.param('id'))
  const input = updateMeetingSchema.parse(await c.req.json())

  db.update(meetings)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description ?? null }),
      ...(input.startDate !== undefined && { startDate: input.startDate }),
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.location !== undefined && { location: input.location ?? null }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(meetings.id, meeting.id))
    .run()

  return c.json(getMeetingOr404(meeting.id))
})

// 删除会议（级联删除 tracks/sessions/speakers/materials 记录）
meetingsRouter.delete('/:id', (c) => {
  const meeting = getMeetingOr404(c.req.param('id'))
  db.delete(meetings).where(eq(meetings.id, meeting.id)).run()
  return c.json({ ok: true })
})

// 状态流转（draft/published/ongoing/finished 任意互转，全部手动切换）
meetingsRouter.post('/:id/status', async (c) => {
  const meeting = getMeetingOr404(c.req.param('id'))
  const { status } = meetingStatusSchema.parse(await c.req.json())

  db.update(meetings)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(meetings.id, meeting.id))
    .run()

  return c.json(getMeetingOr404(meeting.id))
})

// 复制会议：复制场地与场次骨架（标题/类型/起止时间/场地/简介/排序号/全体环节标记；不含嘉宾）
meetingsRouter.post('/:id/duplicate', (c) => {
  const meeting = getMeetingOr404(c.req.param('id'))
  const now = new Date().toISOString()
  const newId = nanoid(12)

  db.transaction((tx) => {
    tx.insert(meetings)
      .values({
        id: newId,
        name: `副本 ${meeting.name}`,
        description: meeting.description,
        startDate: meeting.startDate,
        endDate: meeting.endDate,
        location: meeting.location,
        status: 'draft',
        createdBy: c.get('user').id,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    // 复制场地（新 id 映射，场次引用指向副本）
    const venueRows = tx
      .select()
      .from(venues)
      .where(eq(venues.meetingId, meeting.id))
      .orderBy(asc(venues.sortOrder))
      .all()
    const venueMap = new Map<string, string>()
    for (const v of venueRows) {
      const nv = nanoid(12)
      venueMap.set(v.id, nv)
      tx.insert(venues)
        .values({
          id: nv,
          meetingId: newId,
          name: v.name,
          capacity: v.capacity,
          equipment: v.equipment,
          note: v.note,
          sortOrder: v.sortOrder,
        })
        .run()
    }

    const sessionRows = tx.select().from(sessions).where(eq(sessions.meetingId, meeting.id)).all()
    for (const s of sessionRows) {
      tx.insert(sessions)
        .values({
          id: nanoid(12),
          meetingId: newId,
          venueId: s.venueId ? (venueMap.get(s.venueId) ?? null) : null,
          title: s.title,
          type: s.type,
          startTime: s.startTime,
          endTime: s.endTime,
          description: s.description,
          sortOrder: s.sortOrder,
          crossTracks: s.crossTracks,
        })
        .run()
    }
  })

  return c.json(getMeetingOr404(newId), 201)
})

// 冲突检测（实时计算，仅警告不阻断保存；场地/人员为会议级资源，检测范围为本会议）
meetingsRouter.get('/:id/conflicts', (c) => {
  const meeting = getMeetingOr404(c.req.param('id'))

  const mySessions = db
    .select({
      id: sessions.id,
      meetingId: sessions.meetingId,
      title: sessions.title,
      startTime: sessions.startTime,
      endTime: sessions.endTime,
      venueId: sessions.venueId,
    })
    .from(sessions)
    .where(eq(sessions.meetingId, meeting.id))
    .all()

  const mySpeakers = db
    .select({
      sessionId: sessionSpeakers.sessionId,
      participantId: sessionSpeakers.participantId,
      participantName: participants.name,
    })
    .from(sessionSpeakers)
    .innerJoin(sessions, eq(sessionSpeakers.sessionId, sessions.id))
    .innerJoin(participants, eq(sessionSpeakers.participantId, participants.id))
    .where(eq(sessions.meetingId, meeting.id))
    .all()

  const conflicts = detectConflicts(
    mySessions as ConflictSession[],
    mySpeakers as ConflictSpeaker[],
  )
  return c.json({ data: conflicts, total: conflicts.length })
})

// ---------- 日程表导出（Excel） ----------

const TYPE_LABEL: Record<string, string> = {
  speech: '演讲',
  panel: '圆桌',
  break: '茶歇',
  checkin: '签到',
  other: '其他',
}
const ROLE_LABEL: Record<string, string> = {
  host: '主持',
  speaker: '演讲',
  panelist: '圆桌嘉宾',
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
function WEEKDAY_LABEL(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`)
  return WEEKDAYS[d.getDay()] ?? ''
}

const pad2 = (n: number) => String(n).padStart(2, '0')
/** ISO（UTC 存储）→ 本地 YYYY-MM-DD */
function localDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
/** ISO → 本地 HH:MM */
function localTime(iso: string): string {
  const d = new Date(iso)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// 导出日程表 .xlsx：矩阵式布局 —— 横轴场地、纵轴时间，单元格为场次标题+副标题（类型/嘉宾）
meetingsRouter.get('/:id/export/schedule.xlsx', async (c) => {
  const meeting = getMeetingOr404(c.req.param('id'))

  // 日历中隐藏的场地（前端按天存储 Record<日期, 场地ID[]>，按天应用，不影响其他日期的日程）
  let hiddenVenues: Record<string, string[]> = {}
  try {
    hiddenVenues = JSON.parse(c.req.query('hiddenVenues') ?? '{}') as Record<string, string[]>
    if (!hiddenVenues || typeof hiddenVenues !== 'object' || Array.isArray(hiddenVenues)) {
      hiddenVenues = {}
    }
  } catch {
    hiddenVenues = {}
  }

  const venueRows = db
    .select()
    .from(venues)
    .where(eq(venues.meetingId, meeting.id))
    .orderBy(asc(venues.sortOrder))
    .all()

  const sessionRows = db
    .select()
    .from(sessions)
    .where(eq(sessions.meetingId, meeting.id))
    .orderBy(asc(sessions.startTime))
    .all()

  const speakerRows = db
    .select({
      sessionId: sessionSpeakers.sessionId,
      participantName: participants.name,
      role: sessionSpeakers.role,
    })
    .from(sessionSpeakers)
    .innerJoin(sessions, eq(sessionSpeakers.sessionId, sessions.id))
    .innerJoin(participants, eq(sessionSpeakers.participantId, participants.id))
    .where(eq(sessions.meetingId, meeting.id))
    .all()
  const speakersBySession = new Map<string, string[]>()
  for (const sp of speakerRows) {
    const list = speakersBySession.get(sp.sessionId) ?? []
    list.push(`${sp.participantName}（${ROLE_LABEL[sp.role] ?? sp.role}）`)
    speakersBySession.set(sp.sessionId, list)
  }

  // 按日期分组，组内收集去重的时间段（纵轴行）；仅会议日期范围内的场次（与前端日历一致）
  const dayMap = new Map<string, typeof sessionRows>()
  for (const s of sessionRows) {
    const key = localDate(s.startTime)
    if (key < meeting.startDate || key > meeting.endDate) continue
    const list = dayMap.get(key) ?? []
    list.push(s)
    dayMap.set(key, list)
  }

  // 全体环节（crossTracks）横跨所有场地列；其余场次按场地列归属
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MeetingOS'
  const ws = wb.addWorksheet('日程表', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })

  // 按天计算场地列：当天有场次的场地 − 当天被隐藏的场地，按当天首场开始时间排序（与实际议程顺序一致）
  const dayVenueLists = new Map<string, typeof venueRows>()
  for (const [date, daySessions] of dayMap) {
    const hidden = new Set(hiddenVenues[date] ?? [])
    const firstStart = new Map<string, string>()
    for (const s of daySessions) {
      if (!s.venueId) continue
      const cur = firstStart.get(s.venueId)
      if (!cur || s.startTime < cur) firstStart.set(s.venueId, s.startTime)
    }
    dayVenueLists.set(
      date,
      venueRows
        .filter((v) => firstStart.has(v.id) && !hidden.has(v.id))
        .sort((a, b) => (firstStart.get(a.id) ?? '').localeCompare(firstStart.get(b.id) ?? '')),
    )
  }
  const maxColCount = 1 + Math.max(1, ...[...dayVenueLists.values()].map((vs) => vs.length)) // 时间列 + 场地列
  const lastColLetter = ws.getColumn(maxColCount).letter

  // --- 标题区 ---
  ws.mergeCells(`A1:${lastColLetter}1`)
  const titleCell = ws.getCell('A1')
  titleCell.value = `${meeting.name} · 日程表`
  titleCell.font = { bold: true, size: 14 }
  titleCell.alignment = { horizontal: 'center' }
  ws.mergeCells(`A2:${lastColLetter}2`)
  const infoCell = ws.getCell('A2')
  const dateRange =
    meeting.startDate === meeting.endDate ? meeting.startDate : `${meeting.startDate} ~ ${meeting.endDate}`
  infoCell.value = `日期：${dateRange}${meeting.location ? `    地点：${meeting.location}` : ''}`
  infoCell.alignment = { horizontal: 'center' }
  infoCell.font = { color: { argb: 'FF666666' } }

  // 列宽：时间列 + 场地列
  ws.getColumn(1).width = 14
  for (let i = 2; i <= maxColCount; i++) ws.getColumn(i).width = 26

  const thin = { style: 'thin' as const, color: { argb: 'FFD9D9D9' } }
  const border = { top: thin, left: thin, bottom: thin, right: thin }

  let r = 4
  for (const [date, daySessions] of dayMap) {
    const dayVenues = dayVenueLists.get(date) ?? []
    const dayVenueNames = dayVenues.length > 0 ? dayVenues.map((v) => v.name) : ['场地']
    const dayColCount = 1 + dayVenueNames.length

    // --- 日期分节标题 ---
    ws.mergeCells(r, 1, r, dayColCount)
    const dayCell = ws.getCell(`A${r}`)
    dayCell.value = `${date}（${WEEKDAY_LABEL(date)}）`
    dayCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
    dayCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } }
    dayCell.alignment = { horizontal: 'center', vertical: 'middle' }
    dayCell.border = border
    r += 1

    // --- 表头：时间 + 当天各场地 ---
    const headerRow = ws.getRow(r)
    headerRow.values = ['时间', ...dayVenueNames]
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = border
    })
    headerRow.height = 20
    r += 1

    // --- 时间行（去重的时间段，按开始时间排序） ---
    const timeSlots = [
      ...new Map(daySessions.map((s) => [`${s.startTime}|${s.endTime}`, s])).values(),
    ].sort((a, b) => a.startTime.localeCompare(b.startTime))

    for (const slot of timeSlots) {
      const row = ws.getRow(r)
      // 时间列
      const timeCell = row.getCell(1)
      timeCell.value = `${localTime(slot.startTime)}\n~ ${localTime(slot.endTime)}`
      timeCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      timeCell.font = { color: { argb: 'FF333333' } }
      timeCell.border = border

      // 该时间段的所有场次
      const slotSessions = daySessions.filter(
        (s) => s.startTime === slot.startTime && s.endTime === slot.endTime,
      )
      const cross = slotSessions.find((s) => s.crossTracks)

      for (let col = 2; col <= dayColCount; col++) {
        const cell = row.getCell(col)
        cell.border = border
        cell.alignment = { vertical: 'middle', wrapText: true }
        if (cross) {
          // 全体环节：首列写内容（标题+副标题），整行合并
          if (col === 2) {
            const speakers = (speakersBySession.get(cross.id) ?? []).join('、')
            const subtitle = [TYPE_LABEL[cross.type] ?? cross.type, speakers].filter(Boolean).join(' · ')
            cell.value = subtitle ? `${cross.title}\n${subtitle}` : cross.title
            cell.font = { bold: true }
          }
        } else {
          const venue = dayVenues[col - 2]
          const s = venue ? slotSessions.find((x) => x.venueId === venue.id) : undefined
          if (s) {
            const speakers = (speakersBySession.get(s.id) ?? []).join('、')
            const subtitle = [TYPE_LABEL[s.type] ?? s.type, speakers].filter(Boolean).join(' · ')
            cell.value = subtitle ? `${s.title}\n${subtitle}` : s.title
            cell.font = { bold: true }
          }
        }
      }

      // 全体环节整行合并
      if (cross) {
        ws.mergeCells(r, 2, r, dayColCount)
      }
      r += 1
    }
    // 分节空行
    r += 1
  }

  const buffer = await wb.xlsx.writeBuffer()
  const filename = encodeURIComponent(`${meeting.name}-日程表.xlsx`)
  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  c.header('Content-Disposition', `attachment; filename="schedule.xlsx"; filename*=UTF-8''${filename}`)
  return c.newResponse(buffer as ArrayBuffer)
})

export default meetingsRouter
