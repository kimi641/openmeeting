import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  api,
  type ListResult,
  type Meeting,
  type Organization,
  type Participant,
  type Session,
  type SessionType,
  type Speaker,
  type Venue,
} from '../lib/api'
import { Button } from './ui/button'
import { Input } from './ui/form'
import { cn, DEFAULT_SESSION_TYPE, formatTime, SESSION_TYPE, SPEAKER_ROLE, typeTagStyle } from '../lib/utils'
import { useOrganizations, useSessionTypes } from '../lib/hooks'
import { ParticipantDialog } from './dialogs/ParticipantDialog'
import { VenueDialog } from './dialogs/VenueDialog'
import { SessionTypeDialog } from './dialogs/SessionTypeDialog'
import { OrganizationDialog } from './dialogs/OrganizationDialog'
import { OrganizationDetailDialog, ParticipantDetailDialog, VenueDetailDialog } from './dialogs/DetailDialogs'

type Tab = 'schedule' | 'activities' | 'people' | 'orgs' | 'venues'

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
    activities: 'M4 6h7v5H4zM13 6h7v5h-7zM4 13h7v5H4zM13 13h7v5h-7z',
    people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a5 5 0 0 0-3.5-4.8',
    orgs: 'M9 3h6v4H9zM12 7v4M6 11h12M6 11v6M18 11v6M3 17h6v4H3zM15 17h6v4h-6z',
    venues: 'M3 21V8l9-5 9 5v13M9 21v-6h6v6',
  }
  const LABELS: Record<Tab, string> = { schedule: '日程', activities: '活动', people: '人员', orgs: '组织', venues: '场地' }

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
        {tab === 'activities' && <ActivitiesTab meetingId={meetingId} />}
        {tab === 'people' && <PeopleTab meetingId={meetingId} />}
        {tab === 'orgs' && <OrganizationsTab meetingId={meetingId} />}
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
  const { types: sessionTypes } = useSessionTypes(meetingId)

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

  // 类型 key → 颜色/名称（自定义优先，内置回退）
  const typeMap = useMemo(() => {
    const m: Record<string, { label: string; color: string }> = {}
    for (const [k, v] of Object.entries(SESSION_TYPE)) m[k] = v
    for (const t of sessionTypes) m[t.key] = { label: t.name, color: t.color }
    return m
  }, [sessionTypes])
  const fallbackType = SESSION_TYPE.other ?? DEFAULT_SESSION_TYPE

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
              const typeInfo = typeMap[s.type] ?? DEFAULT_SESSION_TYPE
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
                      className="rounded border px-1 py-0.5 text-[10px]"
                      style={typeTagStyle(typeInfo.color)}
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

// ==================== 活动（类型） Tab ====================

function ActivitiesTab({ meetingId }: { meetingId: string | null }) {
  const { types, reload } = useSessionTypes(meetingId)
  const [sessions, setSessions] = useState<Session[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(false)
  const [dateRange, setDateRange] = useState<[string, string] | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null) // 展开的类型 key
  const [speakersBySession, setSpeakersBySession] = useState<Record<string, Speaker[]>>({})
  const [dialog, setDialog] = useState<{ open: boolean; type: SessionType | null }>({
    open: false,
    type: null,
  })
  const [error, setError] = useState('')
  // 行内改色的暂存值（离开色块才提交，避免连续触发请求）
  const [pendingColor, setPendingColor] = useState<{ key: string; color: string } | null>(null)

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
      api.get<Meeting>(`/meetings/${meetingId}`),
    ])
      .then(([s, v, m]) => {
        setSessions(s.data)
        setVenues(v.data)
        setDateRange([m.startDate, m.endDate])
      })
      .catch(() => {
        setSessions([])
        setVenues([])
        setDateRange(null)
      })
      .finally(() => setLoading(false))
  }, [meetingId])

  const venueMap = useMemo(() => {
    const m: Record<string, Venue> = {}
    for (const v of venues) m[v.id] = v
    return m
  }, [venues])

  // 按类型分组（仅会议日期范围内的场次，与日程 Tab 一致）
  const byType = useMemo(() => {
    const map: Record<string, Session[]> = {}
    for (const s of sessions) {
      const d = new Date(s.startTime)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (dateRange && (key < dateRange[0] || key > dateRange[1])) continue
      ;(map[s.type] ??= []).push(s)
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime))
    }
    return map
  }, [sessions, dateRange])

  /** 展开某类型时按需加载其场次的嘉宾（缓存） */
  async function loadSpeakersFor(list: Session[]) {
    const missing = list.filter((s) => !speakersBySession[s.id])
    if (missing.length === 0) return
    const results = await Promise.all(
      missing.map((s) =>
        api.get<ListResult<Speaker>>(`/sessions/${s.id}/speakers`).catch(() => ({ data: [] as Speaker[] })),
      ),
    )
    setSpeakersBySession((prev) => {
      const next = { ...prev }
      missing.forEach((s, i) => {
        next[s.id] = results[i]?.data ?? []
      })
      return next
    })
  }

  function toggleType(t: SessionType) {
    if (expanded === t.key) {
      setExpanded(null)
      return
    }
    setExpanded(t.key)
    void loadSpeakersFor(byType[t.key] ?? [])
  }

  /** 行内改色提交 */
  async function commitColor(t: SessionType, color: string) {
    setPendingColor(null)
    if (color === t.color) return
    try {
      await api.patch(`/session-types/${t.id}`, { color })
      void reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改颜色失败')
    }
  }

  async function removeType(t: SessionType) {
    if (!window.confirm(`确定删除类型「${t.name}」？`)) return
    setError('')
    try {
      await api.delete(`/session-types/${t.id}`)
      if (expanded === t.key) setExpanded(null)
      void reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  if (!meetingId) return <EmptyHint text="请先打开一个会议" />
  if (loading) return <EmptyHint text="加载中…" />

  const typeList: SessionType[] = types

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end gap-2 border-b border-gray-100 px-2 py-2">
        {error && <span className="min-w-0 flex-1 truncate text-xs text-red-600" title={error}>{error}</span>}
        <Button
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => setDialog({ open: true, type: null })}
        >
          + 新增类型
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        {typeList.length === 0 ? (
          <EmptyHint text="暂无活动类型" />
        ) : (
          <div className="space-y-1">
            {typeList.map((t) => {
              const items = byType[t.key] ?? []
              const isOpen = expanded === t.key
              const color = pendingColor?.key === t.key ? pendingColor.color : t.color
              return (
                <div key={t.id} className="rounded-md border border-gray-100">
                  {/* 类型行：色块（改色）+ 名称 + 场次数 + 操作 */}
                  <div className="group flex cursor-pointer items-center gap-2 px-2 py-2 hover:bg-gray-50">
                    <input
                      type="color"
                      value={color}
                      title="点击修改颜色"
                      className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-full border border-gray-200 bg-white p-0"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setPendingColor({ key: t.key, color: e.target.value })}
                      onBlur={(e) => void commitColor(t, e.target.value)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800" onClick={() => toggleType(t)}>
                      {t.name}
                    </span>
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px]" style={typeTagStyle(color)}>
                      {items.length} 场
                    </span>
                    <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
                      <button
                        className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDialog({ open: true, type: t })
                        }}
                        title="编辑名称/颜色"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation()
                          void removeType(t)
                        }}
                        title="删除类型"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <path d="M4 7h16M9 7V5h6v2m-8 0l1 13h8l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {/* 展开详情：该类型的全部场次 */}
                  {isOpen && (
                    <div className="space-y-1 border-t border-gray-100 px-2 py-2">
                      {items.length === 0 ? (
                        <div className="px-1 py-1 text-xs text-gray-400">暂无该类型的场次</div>
                      ) : (
                        items.map((s) => {
                          const venue = s.venueId ? venueMap[s.venueId] : null
                          const speakers = speakersBySession[s.id] ?? []
                          const d = new Date(s.startTime)
                          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                          return (
                            <div key={s.id} className="rounded border border-gray-100 px-2 py-1.5 text-xs">
                              <div className="flex items-center justify-between gap-1">
                                <span className="truncate font-medium text-gray-800">{s.title}</span>
                                <span className="shrink-0 text-gray-400">
                                  {dateStr} {formatTime(s.startTime)}–{formatTime(s.endTime)}
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 text-gray-400">
                                {venue && <span className="truncate">@ {venue.name}</span>}
                                {speakers.length > 0 && (
                                  <span className="truncate">
                                    {speakers.map((sp) => `${sp.participantName}（${SPEAKER_ROLE[sp.role] ?? sp.role}）`).join('、')}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <SessionTypeDialog
        open={dialog.open}
        sessionType={dialog.type}
        meetingId={meetingId}
        onClose={() => setDialog({ open: false, type: null })}
        onSaved={() => {
          setDialog({ open: false, type: null })
          setError('')
          void reload()
        }}
      />
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
  const [detail, setDetail] = useState<{ open: boolean; participant: Participant | null }>({
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
                className="group flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 hover:bg-gray-50"
                onClick={() => setDetail({ open: true, participant: p })}
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
                    onClick={(e) => {
                      e.stopPropagation()
                      setDialog({ open: true, participant: p })
                    }}
                    title="编辑"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation()
                      void remove(p)
                    }}
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
      <ParticipantDetailDialog
        open={detail.open}
        participant={detail.participant}
        meetingId={meetingId}
        onClose={() => setDetail({ open: false, participant: null })}
      />
    </div>
  )
}

// ==================== 场地 Tab ====================

function VenuesTab({ meetingId }: { meetingId: string | null }) {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState<{ open: boolean; venue: Venue | null }>({ open: false, venue: null })
  const [detail, setDetail] = useState<{ open: boolean; venue: Venue | null }>({ open: false, venue: null })

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
                className="group flex cursor-pointer items-center justify-between rounded-md px-2 py-2 hover:bg-gray-50"
                onClick={() => setDetail({ open: true, venue: v })}
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
                    onClick={(e) => {
                      e.stopPropagation()
                      setDialog({ open: true, venue: v })
                    }}
                    title="编辑"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation()
                      void remove(v)
                    }}
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
      <VenueDetailDialog
        open={detail.open}
        venue={detail.venue}
        meetingId={meetingId}
        onClose={() => setDetail({ open: false, venue: null })}
      />
    </div>
  )
}

// ==================== 组织 Tab ====================

function OrganizationsTab({ meetingId }: { meetingId: string | null }) {
  const { types: organizations, reload } = useOrganizations(meetingId)
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState<{ open: boolean; organization: Organization | null }>({
    open: false,
    organization: null,
  })
  const [detail, setDetail] = useState<{ open: boolean; organization: Organization | null }>({
    open: false,
    organization: null,
  })

  // 组织数据走 useOrganizations 共享缓存；load 仅包装加载态（reload 会同步通知详情页等使用方）
  const load = useCallback(async () => {
    if (!meetingId) return
    setLoading(true)
    try {
      await reload()
    } finally {
      setLoading(false)
    }
  }, [meetingId, reload])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(o: Organization) {
    if (!window.confirm(`确定删除组织「${o.name}」？`)) return
    await api.delete(`/organizations/${o.id}`)
    void load()
  }

  if (!meetingId) return <EmptyHint text="请先打开一个会议" />
  if (loading) return <EmptyHint text="加载中…" />

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-gray-100 px-2 py-2">
        <Button
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => setDialog({ open: true, organization: null })}
        >
          + 新增组织
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        {organizations.length === 0 ? (
          <EmptyHint text="暂无组织" />
        ) : (
          <div className="space-y-0.5">
            {organizations.map((o) => (
              <div
                key={o.id}
                className="group flex cursor-pointer items-center justify-between rounded-md px-2 py-2 hover:bg-gray-50"
                onClick={() => setDetail({ open: true, organization: o })}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800">{o.name}</div>
                  <div className="truncate text-xs text-gray-400">
                    {[o.contact, o.phone].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <div className="ml-2 flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
                  <button
                    className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDialog({ open: true, organization: o })
                    }}
                    title="编辑"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation()
                      void remove(o)
                    }}
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
      <OrganizationDialog
        open={dialog.open}
        organization={dialog.organization}
        meetingId={meetingId}
        onClose={() => setDialog({ open: false, organization: null })}
        onSaved={() => {
          setDialog({ open: false, organization: null })
          void load()
        }}
      />
      <OrganizationDetailDialog
        open={detail.open}
        organization={detail.organization}
        meetingId={meetingId}
        onClose={() => setDetail({ open: false, organization: null })}
      />
    </div>
  )
}

// ==================== 空状态提示 ====================

function EmptyHint({ text }: { text: string }) {
  return <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-gray-400">{text}</div>
}
