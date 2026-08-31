import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api, type ListResult, type Meeting, type Participant, type Session, type Venue } from '../lib/api'
import { Button } from './ui/button'
import { Input } from './ui/form'
import { cn, formatTime, SESSION_TYPE } from '../lib/utils'
import { ParticipantDialog } from './dialogs/ParticipantDialog'
import { VenueDialog } from './dialogs/VenueDialog'

type Tab = 'schedule' | 'people' | 'venues'

/** 从当前路由提取会议 ID */
function useMeetingId(): string | null {
  const location = useLocation()
  const match = location.pathname.match(/^\/meetings\/([^/?#]+)/)
  return match?.[1] ?? null
}

interface RightPanelProps {
  collapsed: boolean
  onToggle: () => void
}

export function RightPanel({ collapsed, onToggle }: RightPanelProps) {
  const [tab, setTab] = useState<Tab>('schedule')
  const meetingId = useMeetingId()

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="flex w-9 shrink-0 flex-col items-center gap-2 border-l border-gray-200 bg-white pt-3 text-gray-400 hover:text-gray-700"
        title="展开侧栏"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    )
  }

  const ICONS: Record<Tab, string> = {
    schedule: 'M4 5h16v13H4zM8 3v4M16 3v4M4 9h16',
    people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a5 5 0 0 0-3.5-4.8',
    venues: 'M3 21V8l9-5 9 5v13M9 21v-6h6v6',
  }
  const LABELS: Record<Tab, string> = { schedule: '日程', people: '人员', venues: '场地' }

  return (
    <aside className="flex w-80 shrink-0 border-l border-gray-200 bg-white">
      {/* 纵向图标标签栏 */}
      <div className="flex w-11 shrink-0 flex-col border-r border-gray-100 bg-gray-50">
        <button
          onClick={onToggle}
          className="flex h-10 items-center justify-center border-b border-gray-100 text-gray-400 hover:text-gray-700"
          title="收起侧栏"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {(Object.keys(ICONS) as Tab[]).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            title={LABELS[key]}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2.5 transition-colors',
              tab === key ? 'bg-white text-blue-700' : 'text-gray-400 hover:text-gray-700',
            )}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0">
              <path d={ICONS[key]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[10px]">{LABELS[key]}</span>
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {tab === 'schedule' && <ScheduleTab meetingId={meetingId} />}
        {tab === 'people' && <PeopleTab meetingId={meetingId} />}
        {tab === 'venues' && <VenuesTab meetingId={meetingId} />}
      </div>
    </aside>
  )
}

// ==================== 日程编排 Tab ====================

function ScheduleTab({ meetingId }: { meetingId: string | null }) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!meetingId) {
      setSessions([])
      setVenues([])
      return
    }
    setLoading(true)
    Promise.all([
      api.get<ListResult<Session>>(`/sessions?meetingId=${meetingId}`),
      api.get<ListResult<Venue>>(`/venues?meetingId=${meetingId}`),
    ])
      .then(([s, v]) => {
        setSessions(s.data)
        setVenues(v.data)
      })
      .catch(() => {
        setSessions([])
        setVenues([])
      })
      .finally(() => setLoading(false))
  }, [meetingId])

  // 会议的日期范围（用于过滤范围外的场次，与主日历保持一致）
  const [dateRange, setDateRange] = useState<[string, string] | null>(null)
  useEffect(() => {
    if (!meetingId) {
      setDateRange(null)
      return
    }
    api
      .get<Meeting>(`/meetings/${meetingId}`)
      .then((m) => setDateRange([m.startDate, m.endDate]))
      .catch(() => setDateRange(null))
  }, [meetingId])

  const venueMap = useMemo(() => {
    const m: Record<string, Venue> = {}
    for (const v of venues) m[v.id] = v
    return m
  }, [venues])

  // 按日期分组（仅会议日期范围内的场次，与主日历一致）
  const dayGroups = useMemo(() => {
    const groups: { date: string; items: Session[] }[] = []
    const map: Record<string, Session[]> = {}
    for (const s of sessions) {
      const d = new Date(s.startTime)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      // 过滤会议日期范围外的场次（如修改会议日期后遗留的旧场次）
      if (dateRange && (key < dateRange[0] || key > dateRange[1])) continue
      ;(map[key] ??= []).push(s)
    }
    const keys = Object.keys(map).sort()
    for (const k of keys) {
      const items = map[k]
      if (!items) continue
      groups.push({
        date: k,
        items: items.sort((a, b) => a.startTime.localeCompare(b.startTime)),
      })
    }
    return groups
  }, [sessions, dateRange])

  if (!meetingId) {
    return <EmptyHint text="请先打开一个会议" />
  }
  if (loading) {
    return <EmptyHint text="加载中…" />
  }
  if (dayGroups.length === 0) {
    return <EmptyHint text="暂无场次安排" />
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 py-2">
      {dayGroups.map((g) => (
        <div key={g.date} className="mb-4">
          <div className="sticky top-0 z-10 mb-1 bg-white px-1 py-1 text-xs font-semibold text-gray-500">
            {g.date}
          </div>
          <div className="space-y-1">
            {g.items.map((s) => {
              const venue = s.venueId ? venueMap[s.venueId] : null
              const typeInfo = SESSION_TYPE[s.type] ?? { label: '其他', className: 'bg-gray-50 text-gray-700 border-gray-200' }
              return (
                <div
                  key={s.id}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-xs',
                    s.crossTracks ? 'border-l-4 border-l-blue-400 bg-blue-50/30' : 'border-gray-100',
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate font-medium text-gray-800">{s.title}</span>
                    <span className="shrink-0 text-gray-400">
                      {formatTime(s.startTime)}–{formatTime(s.endTime)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span
                      className={cn(
                        'rounded border px-1 py-0.5 text-[10px]',
                        typeInfo.className,
                      )}
                    >
                      {typeInfo.label}
                    </span>
                    {venue && <span className="truncate text-gray-400">@ {venue.name}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ==================== 人员 Tab ====================

function PeopleTab({ meetingId }: { meetingId: string | null }) {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState<{ open: boolean; participant: Participant | null }>({
    open: false,
    participant: null,
  })

  const load = useCallback(async () => {
    if (!meetingId) {
      setParticipants([])
      return
    }
    setLoading(true)
    try {
      const q = new URLSearchParams({ meetingId, pageSize: '100' })
      if (keyword.trim()) q.set('keyword', keyword.trim())
      const r = await api.get<ListResult<Participant>>(`/participants?${q}`)
      setParticipants(r.data)
    } finally {
      setLoading(false)
    }
  }, [meetingId, keyword])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(p: Participant) {
    if (!window.confirm(`确定删除人员「${p.name}」？`)) return
    await api.delete(`/participants/${p.id}`)
    void load()
  }

  if (!meetingId) return <EmptyHint text="请先打开一个会议" />
  if (loading) return <EmptyHint text="加载中…" />

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-gray-100 px-2 py-2">
        <Input
          className="h-8 flex-1 text-xs"
          placeholder="搜索人员…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Button size="sm" className="h-8 px-2 text-xs" onClick={() => setDialog({ open: true, participant: null })}>
          +
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        {participants.length === 0 ? (
          <EmptyHint text="暂无人员" />
        ) : (
          <div className="space-y-0.5">
            {participants.map((p) => (
              <div
                key={p.id}
                className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800">{p.name}</div>
                  <div className="truncate text-xs text-gray-400">
                    {[p.orgName, p.title].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <div className="ml-2 flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
                  <button
                    className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                    onClick={() => setDialog({ open: true, participant: p })}
                    title="编辑"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => void remove(p)}
                    title="删除"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M4 7h16M9 7V5h6v2m-8 0l1 13h8l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ParticipantDialog
        open={dialog.open}
        participant={dialog.participant}
        meetingId={meetingId}
        onClose={() => setDialog({ open: false, participant: null })}
        onSaved={() => {
          setDialog({ open: false, participant: null })
          void load()
        }}
      />
    </div>
  )
}

// ==================== 场地 Tab ====================

function VenuesTab({ meetingId }: { meetingId: string | null }) {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState<{ open: boolean; venue: Venue | null }>({ open: false, venue: null })

  const load = useCallback(async () => {
    if (!meetingId) {
      setVenues([])
      return
    }
    setLoading(true)
    try {
      const r = await api.get<ListResult<Venue>>(`/venues?meetingId=${meetingId}`)
      setVenues(r.data)
    } finally {
      setLoading(false)
    }
  }, [meetingId])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(v: Venue) {
    if (!window.confirm(`确定删除场地「${v.name}」？`)) return
    await api.delete(`/venues/${v.id}`)
    void load()
  }

  if (!meetingId) return <EmptyHint text="请先打开一个会议" />
  if (loading) return <EmptyHint text="加载中…" />

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-gray-100 px-2 py-2">
        <Button size="sm" className="h-8 px-2 text-xs" onClick={() => setDialog({ open: true, venue: null })}>
          + 新增场地
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        {venues.length === 0 ? (
          <EmptyHint text="暂无场地" />
        ) : (
          <div className="space-y-0.5">
            {venues.map((v, i) => (
              <div
                key={v.id}
                className="group flex items-center justify-between rounded-md px-2 py-2 hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-300">{i + 1}</span>
                    <span className="truncate text-sm font-medium text-gray-800">{v.name}</span>
                  </div>
                  <div className="truncate text-xs text-gray-400">
                    {[v.capacity ? `容纳 ${v.capacity} 人` : null, v.equipment].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <div className="ml-2 flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
                  <button
                    className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                    onClick={() => setDialog({ open: true, venue: v })}
                    title="编辑"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => void remove(v)}
                    title="删除"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M4 7h16M9 7V5h6v2m-8 0l1 13h8l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <VenueDialog
        open={dialog.open}
        venue={dialog.venue}
        meetingId={meetingId}
        onClose={() => setDialog({ open: false, venue: null })}
        onSaved={() => {
          setDialog({ open: false, venue: null })
          void load()
        }}
      />
    </div>
  )
}

// ==================== 空状态提示 ====================

function EmptyHint({ text }: { text: string }) {
  return <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-gray-400">{text}</div>
}
