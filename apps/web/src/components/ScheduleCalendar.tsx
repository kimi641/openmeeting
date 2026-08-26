import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session, Speaker, Venue } from '../lib/api'
import { Button } from './ui/button'
import { SESSION_TYPE, formatTime } from '../lib/utils'

const HOUR_H = 56
const TIME_COL_W = 52
const SNAP = 15 // 吸附粒度（分钟）
const MIN_DURATION = 15 // 最短时长（分钟）
const MOVE_THRESHOLD_PX = 4 // 超过该位移视为拖拽（否则视为点击）
/** 场次块配色（按类型） */
const SESSION_BLOCK: Record<string, string> = {
  speech: 'bg-blue-50 border-blue-400 text-blue-900 hover:bg-blue-100',
  panel: 'bg-purple-50 border-purple-400 text-purple-900 hover:bg-purple-100',
  break: 'bg-amber-50 border-amber-400 text-amber-900 hover:bg-amber-100',
  checkin: 'bg-teal-50 border-teal-400 text-teal-900 hover:bg-teal-100',
  other: 'bg-gray-50 border-gray-400 text-gray-900 hover:bg-gray-100',
}

const pad = (n: number) => String(n).padStart(2, '0')
const fmtMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
const snap = (m: number) => Math.round(m / SNAP) * SNAP

/** 本地日期+分钟 → UTC ISO（与库内其余时间存储一致） */
function isoOf(date: string, minutes: number): string {
  return new Date(`${date}T${fmtMin(minutes)}:00`).toISOString()
}

/** ISO 时间 → 本地日期 key（YYYY-MM-DD） */
function dateKeyOf(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** ISO 时间 → 当天分钟数 */
function minutesOf(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/** 会议日期范围内的全部日期 */
function eachDate(start: string, end: string): string[] {
  const out: string[] = []
  const d = new Date(`${start}T00:00:00`)
  const e = new Date(`${end}T00:00:00`)
  while (d.getTime() <= e.getTime()) {
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
    d.setDate(d.getDate() + 1)
  }
  return out.length > 0 ? out : [start]
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 日历列：场地（nullVenue 表示"未指定场地"的收纳列） */
interface Column {
  key: string
  name: string
  venue: Venue | null
}

/** 拖拽中的实时状态 */
interface DragInfo {
  session: Session
  mode: 'move' | 'resize'
  grabOffset: number // 按下时鼠标相对块顶部的分钟数
  duration: number
  venueId: string | null
  startMinutes: number
  endMinutes: number
  originX: number
  originY: number
  moved: boolean
}

interface ScheduleCalendarProps {
  meeting: { startDate: string; endDate: string }
  venues: Venue[]
  sessions: Session[]
  speakersBySession: Record<string, Speaker[]>
  /** 有冲突的场次 ID 集合（红色描边标记） */
  conflictSessionIds: Set<string>
  onAddSession: (venueId: string | null, date: string, minutes: number) => void
  onEditSession: (session: Session) => void
  onMoveSession: (session: Session, patch: { venueId: string | null; startTime: string; endTime: string }) => void
  /** 场地列拖拽排序后回传新的场地顺序（不含"未指定"列） */
  onReorderVenues: (venues: Venue[]) => void
  onEditVenue: (venue: Venue) => void
  onRemoveVenue: (venue: Venue) => void
  onAddVenue: () => void
}

export function ScheduleCalendar({
  meeting,
  venues,
  sessions,
  speakersBySession,
  conflictSessionIds,
  onAddSession,
  onEditSession,
  onMoveSession,
  onReorderVenues,
  onEditVenue,
  onRemoveVenue,
  onAddVenue,
}: ScheduleCalendarProps) {
  const days = useMemo(() => eachDate(meeting.startDate, meeting.endDate), [meeting])
  const [dayIdx, setDayIdx] = useState(0)
  const day = days[dayIdx] ?? days[0] ?? ''

  const [drag, setDrag] = useState<DragInfo | null>(null)
  const dragRef = useRef<DragInfo | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // 场地列排序（HTML5 拖拽）
  const [dragColKey, setDragColKey] = useState<string | null>(null)
  const [overColKey, setOverColKey] = useState<string | null>(null)

  // 列 = 场地（按 sortOrder）；存在未指定场地的场次时附加"未指定"收纳列
  const columns = useMemo<Column[]>(() => {
    const cols: Column[] = venues.map((v) => ({ key: v.id, name: v.name, venue: v }))
    if (sessions.some((s) => !s.venueId)) {
      cols.push({ key: '__none__', name: '未指定场地', venue: null })
    }
    return cols
  }, [venues, sessions])

  // 按场地分组
  const sessionsByVenue = useMemo(() => {
    const map: Record<string, Session[]> = {}
    for (const s of sessions) {
      const key = s.venueId ?? '__none__'
      ;(map[key] ??= []).push(s)
    }
    return map
  }, [sessions])

  // 当天的场次
  const daySessions = useMemo(
    () => sessions.filter((s) => dateKeyOf(s.startTime) === day),
    [sessions, day],
  )
  const crossSessions = daySessions.filter((s) => s.crossTracks)

  // 时间轴范围：默认 8:00–22:00，有场次时向外扩展到整点
  const [startMin, endMin] = useMemo(() => {
    let s = 8 * 60
    let e = 22 * 60
    for (const sess of daySessions) {
      s = Math.min(s, Math.floor(minutesOf(sess.startTime) / 60) * 60)
      e = Math.max(e, Math.ceil(minutesOf(sess.endTime) / 60) * 60)
    }
    return [Math.max(0, s), Math.min(24 * 60, e)]
  }, [daySessions])
  const hours = useMemo(() => {
    const out: number[] = []
    for (let h = startMin / 60; h < endMin / 60; h++) out.push(h)
    return out
  }, [startMin, endMin])
  const bodyH = ((endMin - startMin) / 60) * HOUR_H

  const dayLabel = (() => {
    const d = new Date(`${day}T00:00:00`)
    return `${day}（${WEEKDAYS[d.getDay()] ?? ''}）`
  })()

  // ---------- 场次拖拽 / 点击 ----------

  /** pointerdown：在块体（move）或底部把手（resize）上按下 */
  function beginDrag(session: Session, e: React.PointerEvent, mode: 'move' | 'resize') {
    if (e.button !== 0 || !gridRef.current) return
    e.preventDefault()
    e.stopPropagation()
    const rect = gridRef.current.getBoundingClientRect()
    const pointerMin = startMin + ((e.clientY - rect.top) / HOUR_H) * 60
    const blockStart = minutesOf(session.startTime)
    const info: DragInfo = {
      session,
      mode,
      grabOffset: pointerMin - blockStart,
      duration: minutesOf(session.endTime) - blockStart,
      venueId: session.venueId,
      startMinutes: blockStart,
      endMinutes: minutesOf(session.endTime),
      originX: e.clientX,
      originY: e.clientY,
      moved: false,
    }
    dragRef.current = info
    setDrag(info)
  }

  /** 全局 pointermove / pointerup（拖拽期间监听）：未移动即松开 = 点击，打开编辑弹窗 */
  useEffect(() => {
    if (!drag) return

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      const grid = gridRef.current
      if (!d || !grid) return
      const rect = grid.getBoundingClientRect()

      if (!d.moved) {
        if (Math.hypot(e.clientX - d.originX, e.clientY - d.originY) < MOVE_THRESHOLD_PX) return
        d.moved = true
      }

      const pointerMin = startMin + ((e.clientY - rect.top) / HOUR_H) * 60
      let next: DragInfo
      if (d.mode === 'move') {
        let s = snap(pointerMin - d.grabOffset)
        s = Math.max(startMin, Math.min(s, endMin - d.duration))
        // 横向：换列（全场环节不换列）
        let venueId = d.venueId
        if (!d.session.crossTracks && columns.length > 0) {
          const colW = (rect.width - TIME_COL_W) / columns.length
          const idx = Math.floor((e.clientX - rect.left - TIME_COL_W) / colW)
          const col = columns[Math.max(0, Math.min(columns.length - 1, idx))]
          venueId = col?.venue?.id ?? null
        }
        next = { ...d, venueId, startMinutes: s, endMinutes: s + d.duration }
      } else {
        let en = snap(pointerMin)
        en = Math.max(d.startMinutes + MIN_DURATION, Math.min(en, endMin))
        next = { ...d, endMinutes: en }
      }
      dragRef.current = next
      setDrag(next)
    }

    const onUp = () => {
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!d) return
      if (d.moved) {
        const startIso = isoOf(day, d.startMinutes)
        const endIso = isoOf(day, d.endMinutes)
        if (startIso !== d.session.startTime || endIso !== d.session.endTime || d.venueId !== d.session.venueId) {
          onMoveSession(d.session, { venueId: d.venueId, startTime: startIso, endTime: endIso })
        }
      } else if (d.mode === 'move') {
        // 点击（未拖动）→ 打开编辑弹窗
        onEditSession(d.session)
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null, day, startMin, endMin, columns])

  /** 点击列内空白处：换算为分钟数触发新增 */
  function onColumnClick(e: React.MouseEvent<HTMLDivElement>, col: Column) {
    if (e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const minutes = startMin + Math.floor((y / HOUR_H) * 60 / 15) * 15
    onAddSession(col.venue?.id ?? null, day, Math.max(startMin, Math.min(minutes, endMin - 15)))
  }

  // ---------- 场地列排序 ----------

  /** 列头拖拽落点：把拖动列移动到目标列位置 */
  function dropColumn(targetKey: string) {
    const from = dragColKey
    setDragColKey(null)
    setOverColKey(null)
    if (!from || from === targetKey || from === '__none__') return
    const fromIdx = venues.findIndex((v) => v.id === from)
    const toIdx = venues.findIndex((v) => v.id === targetKey)
    if (fromIdx < 0 || toIdx < 0) return
    const next = [...venues]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved!)
    onReorderVenues(next)
  }

  // 拖拽期间隐藏原块，渲染预览
  const dragging = drag?.session

  return (
    <div className={drag ? 'select-none' : undefined}>
      {/* 工具栏：日期分页 + 新增 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={dayIdx <= 0}
            onClick={() => setDayIdx((i) => Math.max(0, i - 1))}
          >
            ‹ 前一天
          </Button>
          <div className="min-w-44 text-center text-sm font-medium text-gray-800">
            {dayLabel}
            {days.length > 1 && (
              <span className="ml-1.5 text-xs font-normal text-gray-400">
                第 {dayIdx + 1}/{days.length} 天
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={dayIdx >= days.length - 1}
            onClick={() => setDayIdx((i) => Math.min(days.length - 1, i + 1))}
          >
            后一天 ›
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">点击空白新增 · 点击场次编辑 · 拖动场次调时间/场地 · 拖动列头排序</span>
          <Button variant="outline" size="sm" onClick={onAddVenue}>
            新增场地
          </Button>
        </div>
      </div>

      {columns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
          暂无场地，点击「新增场地」创建日历第一列
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <div style={{ minWidth: TIME_COL_W + columns.length * 180 }}>
            {/* 列头：场地（可拖拽排序） */}
            <div className="flex border-b border-gray-200 bg-gray-50/80">
              <div className="shrink-0 border-r border-gray-200 py-2 text-center text-xs text-gray-400" style={{ width: TIME_COL_W }}>
                时间
              </div>
              {columns.map((col) => (
                <div
                  key={col.key}
                  className={`group relative flex-1 min-w-44 border-r border-gray-200 px-3 py-2 last:border-r-0 ${
                    col.venue
                      ? 'cursor-grab hover:bg-gray-100/80 active:cursor-grabbing'
                      : ''
                  } ${dragColKey === col.key ? 'opacity-40' : ''} ${
                    overColKey === col.key && dragColKey && dragColKey !== col.key
                      ? 'bg-blue-50 ring-2 ring-inset ring-blue-400'
                      : ''
                  }`}
                  draggable={!!col.venue}
                  title={col.venue ? '拖动列头调整场地顺序' : undefined}
                  onDragStart={(e) => {
                    if (!col.venue) return
                    setDragColKey(col.key)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(e) => {
                    if (!dragColKey) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (overColKey !== col.key) setOverColKey(col.key)
                  }}
                  onDragLeave={() => setOverColKey((k) => (k === col.key ? null : k))}
                  onDrop={(e) => {
                    e.preventDefault()
                    dropColumn(col.key)
                  }}
                  onDragEnd={() => {
                    setDragColKey(null)
                    setOverColKey(null)
                  }}
                >
                  <div className="flex items-center gap-1">
                    {col.venue && (
                      <span className="shrink-0 text-gray-300 group-hover:text-gray-500" aria-hidden>
                        ⠿
                      </span>
                    )}
                    <span className="truncate text-sm font-medium text-gray-800" title={col.name}>
                      {col.name}
                    </span>
                  </div>
                  <div className="truncate text-xs text-gray-400">
                    {col.venue?.capacity ? `容纳 ${col.venue.capacity} 人` : ' '}
                  </div>
                  {col.venue && (
                    <div className="absolute top-1 right-1 hidden gap-0.5 group-hover:flex">
                      <button
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
                        title="编辑场地"
                        onClick={() => onEditVenue(col.venue!)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <path d="M4 20h4L20 8l-4-4L4 16v4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        title="删除场地（其下场次变为未指定）"
                        onClick={() => onRemoveVenue(col.venue!)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 网格主体 */}
            <div className="relative flex" ref={gridRef}>
              {/* 时间轴 */}
              <div className="relative shrink-0 border-r border-gray-200" style={{ width: TIME_COL_W, height: bodyH }}>
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute right-1.5 -translate-y-1/2 text-xs text-gray-400"
                    style={{ top: (h * 60 - startMin) / 60 * HOUR_H }}
                  >
                    {pad(h)}:00
                  </div>
                ))}
              </div>

              {/* 场次列（按场地） */}
              {columns.map((col) => (
                <div
                  key={col.key}
                  className="relative flex-1 min-w-44 cursor-copy border-r border-gray-200 last:border-r-0 hover:bg-gray-50/60"
                  style={{ height: bodyH }}
                  onClick={(e) => onColumnClick(e, col)}
                >
                  {/* 整点横线 */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="pointer-events-none absolute inset-x-0 border-t border-gray-100"
                      style={{ top: (h * 60 - startMin) / 60 * HOUR_H }}
                    />
                  ))}
                  {(sessionsByVenue[col.key] ?? [])
                    .filter((s) => dateKeyOf(s.startTime) === day && !s.crossTracks)
                    .map((s) =>
                      dragging?.id === s.id ? null : (
                        <SessionBlock
                          key={s.id}
                          session={s}
                          startMin={startMin}
                          speakers={speakersBySession[s.id] ?? []}
                          conflicted={conflictSessionIds.has(s.id)}
                          onBeginDrag={(e, mode) => beginDrag(s, e, mode)}
                        />
                      ),
                    )}
                  {/* 拖拽预览（普通列） */}
                  {drag && !drag.session.crossTracks && (drag.venueId ?? '__none__') === col.key && (
                    <DragPreview drag={drag} startMin={startMin} speakers={speakersBySession[drag.session.id] ?? []} />
                  )}
                </div>
              ))}

              {/* 全场环节：横跨全部列 */}
              {crossSessions.map((s) =>
                dragging?.id === s.id ? null : (
                  <div
                    key={`cross-${s.id}`}
                    className="pointer-events-none absolute z-10"
                    style={{ left: TIME_COL_W, right: 0, top: 0, height: bodyH }}
                  >
                    <SessionBlock
                      session={s}
                      startMin={startMin}
                      speakers={speakersBySession[s.id] ?? []}
                      conflicted={conflictSessionIds.has(s.id)}
                      cross
                      onBeginDrag={(e, mode) => beginDrag(s, e, mode)}
                    />
                  </div>
                ),
              )}
              {/* 拖拽预览（全场环节，横跨整行） */}
              {drag && drag.session.crossTracks && (
                <div
                  className="pointer-events-none absolute z-10"
                  style={{ left: TIME_COL_W, right: 0, top: 0, height: bodyH }}
                >
                  <DragPreview drag={drag} startMin={startMin} speakers={speakersBySession[drag.session.id] ?? []} cross />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 拖拽中的预览块：跟随鼠标，显示吸附后的实时时间 */
function DragPreview({
  drag,
  startMin,
  speakers,
  cross,
}: {
  drag: DragInfo
  startMin: number
  speakers: Speaker[]
  cross?: boolean
}) {
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-md border-l-4 border-blue-500 bg-blue-100/90 px-2 py-1 shadow-lg ring-2 ring-blue-500"
      style={{
        top: ((drag.startMinutes - startMin) / 60) * HOUR_H,
        height: Math.max(((drag.endMinutes - drag.startMinutes) / 60) * HOUR_H, 22),
        ...(cross ? { left: 8, right: 8 } : { left: 4, right: 4 }),
      }}
    >
      <div className="truncate text-xs font-semibold text-blue-900">{drag.session.title}</div>
      <div className="truncate text-[11px] font-medium text-blue-700">
        {fmtMin(drag.startMinutes)}–{fmtMin(drag.endMinutes)}
      </div>
      {speakers.length > 0 && (
        <div className="truncate text-[11px] text-blue-700/70">{speakers.map((s) => s.participantName).join('、')}</div>
      )}
    </div>
  )
}

function SessionBlock({
  session,
  startMin,
  speakers,
  conflicted,
  cross,
  onBeginDrag,
}: {
  session: Session
  startMin: number
  speakers: Speaker[]
  conflicted: boolean
  cross?: boolean
  onBeginDrag: (e: React.PointerEvent, mode: 'move' | 'resize') => void
}) {
  const top = ((minutesOf(session.startTime) - startMin) / 60) * HOUR_H
  const rawH = ((minutesOf(session.endTime) - minutesOf(session.startTime)) / 60) * HOUR_H
  const height = Math.max(rawH, 22)
  const typeMeta = SESSION_TYPE[session.type]

  return (
    <div
      className={`group pointer-events-auto absolute cursor-grab overflow-hidden rounded-md border-l-4 px-2 py-1 text-left shadow-sm transition-colors active:cursor-grabbing ${
        SESSION_BLOCK[session.type] ?? SESSION_BLOCK.other
      } ${conflicted ? 'ring-2 ring-red-400' : ''}`}
      style={{ top, height, ...(cross ? { left: 8, right: 8 } : { left: 4, right: 4 }) }}
      title={`${formatTime(session.startTime)}–${formatTime(session.endTime)} ${session.title}${
        speakers.length > 0 ? ` · ${speakers.map((sp) => sp.participantName).join('、')}` : ''
      }${conflicted ? '（存在冲突）' : ''}（点击编辑）`}
      onPointerDown={(e) => onBeginDrag(e, 'move')}
    >
      <div className="flex items-center gap-1">
        <span className="truncate text-xs font-semibold">{session.title}</span>
        {cross && <span className="shrink-0 rounded bg-indigo-100 px-1 text-[10px] text-indigo-700">全场</span>}
      </div>
      {height >= 34 && (
        <div className="truncate text-[11px] opacity-70">
          {formatTime(session.startTime)}–{formatTime(session.endTime)}
        </div>
      )}
      {height >= 52 && speakers.length > 0 && (
        <div className="truncate text-[11px] opacity-70">
          {speakers.map((sp) => sp.participantName).join('、')}
        </div>
      )}
      {height >= 70 && typeMeta && (
        <div className="mt-0.5 inline-block rounded bg-white/60 px-1 text-[10px] opacity-80">{typeMeta.label}</div>
      )}
      {/* 底部拉伸把手 */}
      {height >= 22 && (
        <div
          className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-center justify-center"
          onPointerDown={(e) => onBeginDrag(e, 'resize')}
          title="拖动调整时长"
        >
          <div className="h-0.5 w-5 rounded bg-current opacity-0 transition-opacity group-hover:opacity-40" />
        </div>
      )}
    </div>
  )
}
