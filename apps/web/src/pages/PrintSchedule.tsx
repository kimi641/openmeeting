import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type ListResult, type Meeting, type Session, type SessionType, type Speaker, type Venue } from '../lib/api'
import { DEFAULT_SESSION_TYPE, SESSION_TYPE, getHiddenVenueMap } from '../lib/utils'

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const pad2 = (n: number) => String(n).padStart(2, '0')
function dateKeyOf(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function timeOf(iso: string): string {
  const d = new Date(iso)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
function weekdayOf(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`)
  return WEEKDAYS[d.getDay()] ?? ''
}

const ROLE_LABEL: Record<string, string> = {
  host: '主持',
  speaker: '演讲',
  panelist: '圆桌嘉宾',
}

/** 单元格内容：标题 + 第二行副标题（类型 · 嘉宾） */
function CellContent({
  title,
  type,
  typeMap,
  speakers,
  cross,
}: {
  title: string
  type: string
  typeMap: Record<string, { label: string; color: string }>
  speakers: Speaker[]
  cross?: boolean
}) {
  const typeInfo = typeMap[type] ?? DEFAULT_SESSION_TYPE
  const speakerText = speakers
    .map((sp) => `${sp.participantName}（${ROLE_LABEL[sp.role] ?? sp.role}）`)
    .join('、')
  const subtitle = [typeInfo.label, speakerText].filter(Boolean).join(' · ')
  return (
    <>
      <div className="font-semibold text-gray-900">
        {title}
        {cross && <span className="ml-1 text-[10px] font-normal text-blue-600">（全体环节）</span>}
      </div>
      {subtitle && <div className="mt-0.5 text-[10px] leading-snug text-gray-500">{subtitle}</div>}
    </>
  )
}

/** 日程表打印页（浏览器打印 → 另存为 PDF） */
export function PrintSchedulePage() {
  const { id } = useParams()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [speakersBySession, setSpeakersBySession] = useState<Record<string, Speaker[]>>({})
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([])
  const [notFound, setNotFound] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        const m = await api.get<Meeting>(`/meetings/${id}`)
        const [venueRes, sessionRes, typeRes] = await Promise.all([
          api.get<ListResult<Venue>>(`/venues?meetingId=${id}`),
          api.get<ListResult<Session>>(`/sessions?meetingId=${id}`),
          api.get<ListResult<SessionType>>(`/session-types?meetingId=${id}`).catch(() => ({ data: [] as SessionType[] })),
        ])
        if (cancelled) return
        setMeeting(m)
        setVenues(venueRes.data)
        setSessions(sessionRes.data)
        setSessionTypes(typeRes.data)

        const speakerLists = await Promise.all(
          sessionRes.data.map((s) =>
            api.get<ListResult<Speaker>>(`/sessions/${s.id}/speakers`).catch(() => ({ data: [] as Speaker[] })),
          ),
        )
        if (cancelled) return
        const bySession: Record<string, Speaker[]> = {}
        sessionRes.data.forEach((s, i) => {
          bySession[s.id] = speakerLists[i]?.data ?? []
        })
        setSpeakersBySession(bySession)
        setReady(true)
      } catch {
        if (!cancelled) setNotFound(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  // 数据就绪后自动唤起打印（通过 URL 参数 ?auto=1 控制自动打印）
  const params = new URLSearchParams(window.location.search)
  const auto = params.get('auto') === '1'
  useEffect(() => {
    if (ready && auto) {
      const t = window.setTimeout(() => window.print(), 300)
      return () => window.clearTimeout(t)
    }
  }, [ready, auto])

  // 日历中隐藏的场地（localStorage 按天存储，按天应用，不影响其他日期的日程）
  const hiddenMap = useMemo(() => (id ? getHiddenVenueMap(id) : {}), [id])

  // 类型 key → 名称/颜色（自定义优先，内置回退）
  const typeMap = useMemo(() => {
    const m: Record<string, { label: string; color: string }> = {}
    for (const [k, v] of Object.entries(SESSION_TYPE)) m[k] = v
    for (const t of sessionTypes) m[t.key] = { label: t.name, color: t.color }
    return m
  }, [sessionTypes])

  // 按日期分组（升序），组内提取去重时间段（纵轴行，按开始时间排序）；
  // 每天的场地列 = 当天有场次的场地 − 当天被隐藏的场地（与日历页面所见一致）；
  // 仅输出会议日期范围内的场次（与主日历一致，排除遗留的范围外场次）
  const dayGroups = useMemo(() => {
    const map: Record<string, Session[]> = {}
    for (const s of sessions) {
      const key = dateKeyOf(s.startTime)
      if (meeting && (key < meeting.startDate || key > meeting.endDate)) continue
      ;(map[key] ??= []).push(s)
    }
    return Object.keys(map)
      .sort()
      .map((date) => {
        const daySessions = map[date] ?? []
        const hidden = new Set(hiddenMap[date] ?? [])
        // 场地按当天首场开始时间排序（与实际议程顺序一致）
        const firstStart = new Map<string, string>()
        for (const s of daySessions) {
          if (!s.venueId) continue
          const cur = firstStart.get(s.venueId)
          if (!cur || s.startTime < cur) firstStart.set(s.venueId, s.startTime)
        }
        const dayVenues = venues
          .filter((v) => firstStart.has(v.id) && !hidden.has(v.id))
          .sort((a, b) => (firstStart.get(a.id) ?? '').localeCompare(firstStart.get(b.id) ?? ''))
        const slots = [...new Map(daySessions.map((s) => [`${s.startTime}|${s.endTime}`, s])).values()]
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .map((slot) => ({
            startTime: slot.startTime,
            endTime: slot.endTime,
            items: daySessions.filter(
              (s) => s.startTime === slot.startTime && s.endTime === slot.endTime,
            ),
          }))
        return { date, slots, dayVenues }
      })
      .filter((g) => g.slots.length > 0)
  }, [sessions, venues, hiddenMap, meeting])

  const dateRange =
    meeting && meeting.startDate === meeting.endDate
      ? meeting.startDate
      : `${meeting?.startDate ?? ''} ~ ${meeting?.endDate ?? ''}`

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
        会议不存在，
        <Link to="/meetings" className="text-blue-600 underline">
          返回列表
        </Link>
      </div>
    )
  }
  if (!ready || !meeting) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">加载中…</div>
  }

  return (
    <div className="print-root min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <style>{`
        @page { size: A4 portrait; margin: 12mm 10mm; }
        @media print {
          .no-print { display: none !important; }
          .print-doc { box-shadow: none !important; border: none !important; margin: 0 !important; }
          .day-section { break-inside: auto; }
          .day-title { break-after: avoid; }
          table tr { break-inside: avoid; }
        }
      `}</style>

      {/* 工具栏（打印时隐藏） */}
      <div className="no-print mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4">
        <Link to={`/meetings/${meeting.id}`} className="text-sm text-gray-500 hover:text-gray-800">
          ‹ 返回会议
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          打印 / 另存为 PDF
        </button>
      </div>

      {/* A4 文档 */}
      <div className="print-doc mx-auto max-w-[820px] border bg-white p-10 shadow-md print:p-0">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900">{meeting.name}</h1>
          <h2 className="mt-1 text-sm font-medium text-gray-600">日程表</h2>
          <p className="mt-2 text-xs text-gray-500">
            日期：{dateRange}
            {meeting.location ? `　　地点：${meeting.location}` : ''}
          </p>
        </div>

        {dayGroups.length === 0 ? (
          <div className="mt-16 text-center text-sm text-gray-400">暂无场次安排</div>
        ) : (
          <div className="mt-8 space-y-8">
            {dayGroups.map((g) => (
              <section key={g.date} className="day-section">
                <h3 className="day-title mb-2 border-l-4 border-blue-600 pl-2 text-base font-semibold text-gray-800">
                  {g.date}（{weekdayOf(g.date)}）
                </h3>
                {/* 矩阵式日程：横轴场地、纵轴时间；每天占满页宽，当天场地列均分剩余宽度 */}
                <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '88px' }} />
                    {g.dayVenues.length > 0
                      ? g.dayVenues.map((v) => <col key={v.id} />)
                      : <col />}
                  </colgroup>
                  <thead>
                    <tr className="bg-blue-600 text-white">
                      <th className="border border-blue-600 px-2 py-1.5">时间</th>
                      {g.dayVenues.map((v) => (
                        <th key={v.id} className="border border-blue-600 px-2 py-1.5 break-words">
                          {v.name}
                        </th>
                      ))}
                      {g.dayVenues.length === 0 && (
                        <th className="border border-blue-600 px-2 py-1.5">场地</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {g.slots.map((slot) => {
                      const cross = slot.items.find((s) => s.crossTracks)
                      return (
                        <tr key={`${slot.startTime}`}>
                          <td className="border border-gray-300 px-2 py-1.5 text-center align-middle text-gray-700">
                            {timeOf(slot.startTime)}
                            <span className="text-gray-400"> – </span>
                            {timeOf(slot.endTime)}
                          </td>
                          {cross ? (
                            // 全体环节：横跨所有场地列
                            <td
                              colSpan={Math.max(1, g.dayVenues.length)}
                              className="border border-gray-300 bg-blue-50/40 px-2 py-1.5 text-center align-middle break-words"
                            >
                              <CellContent
                                title={cross.title}
                                type={cross.type}
                                typeMap={typeMap}
                                speakers={speakersBySession[cross.id] ?? []}
                                cross
                              />
                            </td>
                          ) : (
                            g.dayVenues.map((v) => {
                              const s = slot.items.find((x) => x.venueId === v.id)
                              return (
                                <td
                                  key={v.id}
                                  className="border border-gray-300 px-2 py-1.5 align-middle break-words"
                                >
                                  {s ? (
                                    <CellContent
                                      title={s.title}
                                      type={s.type}
                                      typeMap={typeMap}
                                      speakers={speakersBySession[s.id] ?? []}
                                    />
                                  ) : null}
                                </td>
                              )
                            })
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}

        <p className="mt-6 text-right text-[10px] text-gray-300">
          生成于 {new Date().toLocaleString('zh-CN')}
        </p>
      </div>
    </div>
  )
}
