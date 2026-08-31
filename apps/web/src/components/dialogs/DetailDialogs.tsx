import { useEffect, useState } from 'react'
import {
  api,
  type ListResult,
  type Meeting,
  type Organization,
  type Participant,
  type Session,
  type SessionOrganizer,
  type Speaker,
  type Venue,
} from '../../lib/api'
import { formatTime, SPEAKER_ROLE } from '../../lib/utils'
import { Dialog } from '../ui/dialog'

/** ISO 时间 → 本地日期（YYYY-MM-DD） */
function sessionDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

interface DetailField {
  label: string
  value: string | null | undefined
}

/** 关联场次行：日期 · 起止时间 · 标题（· 角色） */
interface SessionRow {
  id: string
  date: string
  time: string
  title: string
  role?: string
}

function toRow(s: Session, role?: string): SessionRow {
  return {
    id: s.id,
    date: sessionDate(s.startTime),
    time: `${formatTime(s.startTime)}–${formatTime(s.endTime)}`,
    title: s.title,
    role,
  }
}

/** 可复用详情结构：字段键值列表 + 关联场次分区（只读） */
function DetailView({
  open,
  title,
  fields,
  sectionTitle,
  sessions,
  loading,
  onClose,
}: {
  open: boolean
  title: string
  fields: DetailField[]
  sectionTitle: string
  sessions: SessionRow[]
  loading: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      {loading ? (
        <div className="py-6 text-center text-sm text-gray-400">加载中…</div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            {fields.map((f) => (
              <div key={f.label} className="flex gap-3 text-sm">
                <span className="w-16 shrink-0 text-gray-500">{f.label}</span>
                <span className="min-w-0 flex-1 break-words text-gray-800">{f.value || '—'}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-gray-500">{sectionTitle}</div>
            {sessions.length === 0 ? (
              <div className="text-sm text-gray-400">—</div>
            ) : (
              <div className="space-y-1">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 rounded-md border border-gray-100 px-2 py-1.5 text-xs"
                  >
                    <span className="text-gray-500">{s.date}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-500">{s.time}</span>
                    <span className="text-gray-300">·</span>
                    <span className="font-medium text-gray-800">{s.title}</span>
                    {s.role && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-500">{s.role}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}

// ==================== 人员详情 ====================

export function ParticipantDetailDialog({
  open,
  participant,
  meetingId,
  onClose,
}: {
  open: boolean
  participant: Participant | null
  meetingId: string
  onClose: () => void
}) {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !participant) {
      setSessions([])
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      // 会议全部场次 + 每个场次的嘉宾（失败按空处理）
      const r = await api
        .get<ListResult<Session>>(`/sessions?meetingId=${meetingId}`)
        .catch(() => ({ data: [] as Session[] }))
      const results = await Promise.all(
        r.data.map((s) =>
          api.get<ListResult<Speaker>>(`/sessions/${s.id}/speakers`).catch(() => ({ data: [] as Speaker[] })),
        ),
      )
      if (cancelled) return
      const rows = r.data
        .map((s, i) => ({ s, speakers: results[i]?.data ?? [] }))
        .filter(({ speakers }) => speakers.some((sp) => sp.participantId === participant.id))
        .sort((a, b) => a.s.startTime.localeCompare(b.s.startTime))
        .map(({ s, speakers }) => {
          const mine = speakers.find((sp) => sp.participantId === participant.id)
          return toRow(s, mine ? SPEAKER_ROLE[mine.role] ?? mine.role : undefined)
        })
      setSessions(rows)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, participant, meetingId])

  const fields: DetailField[] = participant
    ? [
        { label: '姓名', value: participant.name },
        { label: '单位', value: participant.orgName },
        { label: '职务', value: participant.title },
        { label: '电话', value: participant.phone },
        { label: '邮箱', value: participant.email },
        { label: '备注', value: participant.note },
      ]
    : []

  return (
    <DetailView
      open={open}
      title="人员详情"
      fields={fields}
      sectionTitle="参与场次"
      sessions={sessions}
      loading={loading}
      onClose={onClose}
    />
  )
}

// ==================== 场地详情 ====================

export function VenueDetailDialog({
  open,
  venue,
  meetingId,
  onClose,
}: {
  open: boolean
  venue: Venue | null
  meetingId: string
  onClose: () => void
}) {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !venue) {
      setSessions([])
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      const [sr, mr] = await Promise.all([
        api.get<ListResult<Session>>(`/sessions?meetingId=${meetingId}`).catch(() => ({ data: [] as Session[] })),
        api.get<Meeting>(`/meetings/${meetingId}`).catch(() => null),
      ])
      if (cancelled) return
      // 仅会议日期范围内的场次（与日程 Tab 的过滤保持一致）
      const range = mr ? ([mr.startDate, mr.endDate] as [string, string]) : null
      const rows = sr.data
        .filter((s) => s.venueId === venue.id)
        .filter((s) => {
          const d = sessionDate(s.startTime)
          return !range || (d >= range[0] && d <= range[1])
        })
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .map((s) => toRow(s))
      setSessions(rows)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, venue, meetingId])

  const fields: DetailField[] = venue
    ? [
        { label: '场地名称', value: venue.name },
        { label: '容纳人数', value: venue.capacity ? `${venue.capacity} 人` : null },
        { label: '设备', value: venue.equipment },
        { label: '备注', value: venue.note },
      ]
    : []

  return (
    <DetailView
      open={open}
      title="场地详情"
      fields={fields}
      sectionTitle="该场地场次"
      sessions={sessions}
      loading={loading}
      onClose={onClose}
    />
  )
}

// ==================== 组织详情 ====================

export function OrganizationDetailDialog({
  open,
  organization,
  meetingId,
  onClose,
}: {
  open: boolean
  organization: Organization | null
  meetingId: string
  onClose: () => void
}) {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !organization) {
      setSessions([])
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      // 会议全部场次 + 每个场次的主办组织（失败按空处理）
      const r = await api
        .get<ListResult<Session>>(`/sessions?meetingId=${meetingId}`)
        .catch(() => ({ data: [] as Session[] }))
      const results = await Promise.all(
        r.data.map((s) =>
          api
            .get<ListResult<SessionOrganizer>>(`/sessions/${s.id}/organizers`)
            .catch(() => ({ data: [] as SessionOrganizer[] })),
        ),
      )
      if (cancelled) return
      const rows = r.data
        .map((s, i) => ({ s, organizers: results[i]?.data ?? [] }))
        .filter(({ organizers }) => organizers.some((o) => o.organizationId === organization.id))
        .sort((a, b) => a.s.startTime.localeCompare(b.s.startTime))
        .map(({ s }) => toRow(s))
      setSessions(rows)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, organization, meetingId])

  const fields: DetailField[] = organization
    ? [
        { label: '名称', value: organization.name },
        { label: '联系人', value: organization.contact },
        { label: '联系电话', value: organization.phone },
        { label: '备注', value: organization.note },
      ]
    : []

  return (
    <DetailView
      open={open}
      title="组织详情"
      fields={fields}
      sectionTitle="主办场次"
      sessions={sessions}
      loading={loading}
      onClose={onClose}
    />
  )
}
