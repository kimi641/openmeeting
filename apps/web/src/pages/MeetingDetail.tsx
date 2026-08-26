import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  api,
  type Conflict,
  type ListResult,
  type Meeting,
  type Participant,
  type Session,
  type Speaker,
  type Venue,
} from '../lib/api'
import { Button } from '../components/ui/button'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Dialog, DialogFooter } from '../components/ui/dialog'
import { Field, Input, Select, Textarea } from '../components/ui/form'
import { ScheduleCalendar } from '../components/ScheduleCalendar'
import {
  MEETING_STATUS,
  SESSION_TYPE,
  SPEAKER_ROLE,
  fromLocalInputValue,
  toLocalInputValue,
} from '../lib/utils'

const STATUS_FLOW = ['draft', 'published', 'ongoing', 'finished'] as const

export function MeetingDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [venues, setVenues] = useState<Venue[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [speakersBySession, setSpeakersBySession] = useState<Record<string, Speaker[]>>({})
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound_, setNotFound] = useState(false)

  const [showEdit, setShowEdit] = useState(false)
  const [venueDialog, setVenueDialog] = useState<{ open: boolean; venue: Venue | null }>({
    open: false,
    venue: null,
  })
  const [sessionDialog, setSessionDialog] = useState<{
    open: boolean
    venueId: string | null
    session: Session | null
    defaults?: { date: string; startMinutes: number }
  }>({ open: false, venueId: null, session: null })

  const load = useCallback(async () => {
    try {
      const m = await api.get<Meeting>(`/meetings/${id}`)
      setMeeting(m)
      const [venueRes, sessionRes] = await Promise.all([
        api.get<ListResult<Venue>>(`/venues?meetingId=${id}`),
        api.get<ListResult<Session>>(`/sessions?meetingId=${id}`),
      ])
      setVenues(venueRes.data)
      setSessions(sessionRes.data)

      const speakerLists = await Promise.all(
        sessionRes.data.map((s) =>
          api.get<ListResult<Speaker>>(`/sessions/${s.id}/speakers`).catch(() => ({ data: [] as Speaker[] })),
        ),
      )
      const bySession: Record<string, Speaker[]> = {}
      sessionRes.data.forEach((s, i) => {
        bySession[s.id] = speakerLists[i]?.data ?? []
      })
      setSpeakersBySession(bySession)

      const cf = await api.get<ListResult<Conflict>>(`/meetings/${id}/conflicts`)
      setConflicts(cf.data)
    } catch (err) {
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
        setNotFound(true)
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
    api
      .get<ListResult<Participant>>(`/participants?meetingId=${id}&pageSize=100`)
      .then((r) => setParticipants(r.data))
      .catch(() => {})
  }, [load])

  const conflictErrors = useMemo(() => conflicts.filter((c) => c.level === 'error'), [conflicts])
  const conflictWarnings = useMemo(() => conflicts.filter((c) => c.level === 'warning'), [conflicts])
  const conflictSessionIds = useMemo(
    () => new Set(conflicts.flatMap((c) => c.sessionIds)),
    [conflicts],
  )

  async function changeStatus(status: string) {
    if (!meeting || status === meeting.status) return
    await api.post(`/meetings/${meeting.id}/status`, { status })
    void load()
  }

  async function duplicate() {
    if (!meeting) return
    const m = await api.post<Meeting>(`/meetings/${meeting.id}/duplicate`)
    navigate(`/meetings/${m.id}`)
  }

  async function remove() {
    if (!meeting) return
    if (!window.confirm(`确定删除会议「${meeting.name}」？其下场次将一并删除。`)) return
    await api.delete(`/meetings/${meeting.id}`)
    navigate('/meetings', { replace: true })
  }

  async function removeVenue(v: Venue) {
    if (!window.confirm(`确定删除场地「${v.name}」？所有会议中引用它的场次将变为未指定场地。`)) return
    await api.delete(`/venues/${v.id}`)
    void load()
  }

  async function removeSession(s: Session) {
    if (!window.confirm(`确定删除场次「${s.title}」？`)) return
    await api.delete(`/sessions/${s.id}`)
    void load()
  }

  /** 日历拖拽落点保存（换场地 / 改时间 / 拉伸时长），冲突仅警告不阻断 */
  async function moveSession(
    s: Session,
    patch: { venueId: string | null; startTime: string; endTime: string },
  ) {
    await api.post(`/sessions/${s.id}/move`, patch)
    void load()
  }

  /** 日历场地列拖拽排序：乐观更新 + 持久化 */
  async function reorderVenues(ordered: Venue[]) {
    setVenues(ordered)
    await api.post('/venues/reorder', { venueIds: ordered.map((v) => v.id) }).catch(() => {})
  }

  if (loading) {
    return <div className="py-20 text-center text-sm text-gray-400">加载中…</div>
  }
  if (notFound_ || !meeting) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">
        会议不存在，
        <Link to="/meetings" className="text-blue-700 hover:underline">
          返回列表
        </Link>
      </div>
    )
  }

  const statusMeta = MEETING_STATUS[meeting.status]

  return (
    <div>
      {/* 头部 */}
      <div className="mb-5">
        <Link to="/meetings" className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-700">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          返回会议列表
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{meeting.name}</h1>
            <Badge className={statusMeta?.className}>{statusMeta?.label}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Select
              className="w-28"
              value={meeting.status}
              onChange={(e) => void changeStatus(e.target.value)}
              title="切换会议状态"
            >
              {STATUS_FLOW.map((s) => (
                <option key={s} value={s}>
                  {MEETING_STATUS[s]?.label ?? s}
                </option>
              ))}
            </Select>
            <Button variant="outline" onClick={() => void duplicate()}>
              复制
            </Button>
            <Button variant="outline" onClick={() => setShowEdit(true)}>
              编辑
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              删除
            </Button>
          </div>
        </div>
      </div>

      {/* 基本信息 */}
      <Card className="mb-5">
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-2 pt-5 text-sm md:grid-cols-4">
          <InfoItem label="日期" value={meeting.startDate === meeting.endDate ? meeting.startDate : `${meeting.startDate} ~ ${meeting.endDate}`} />
          <InfoItem label="举办地点" value={meeting.location ?? '-'} />
          <InfoItem label="场地" value={String(venues.length)} />
          <InfoItem label="场次" value={String(sessions.length)} />
          {meeting.description && (
            <div className="col-span-2 mt-1 md:col-span-4">
              <span className="text-gray-400">简介：</span>
              <span className="text-gray-600">{meeting.description}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 冲突面板 */}
      {conflicts.length > 0 && (
        <Card className="mb-5 border-amber-200">
          <CardHeader>
            <CardTitle className="text-amber-700">
              冲突提醒（{conflicts.length}）<span className="ml-1 text-xs font-normal text-gray-400">仅警告，不阻断保存</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {conflictErrors.map((c, i) => (
              <ConflictRow key={`e${i}`} level="error" text={c.message} />
            ))}
            {conflictWarnings.map((c, i) => (
              <ConflictRow key={`w${i}`} level="warning" text={c.message} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* 日程编排：日历视图（纵轴时间 / 横轴场地 / 按天分页） */}
      <h2 className="mb-3 text-base font-semibold">日程编排</h2>
      <ScheduleCalendar
        meeting={meeting}
        venues={venues}
        sessions={sessions}
        speakersBySession={speakersBySession}
        conflictSessionIds={conflictSessionIds}
        onAddSession={(venueId, date, minutes) =>
          setSessionDialog({ open: true, venueId, session: null, defaults: { date, startMinutes: minutes } })
        }
        onEditSession={(session) =>
          setSessionDialog({ open: true, venueId: session.venueId, session })
        }
        onMoveSession={(session, patch) => void moveSession(session, patch)}
        onReorderVenues={(ordered) => void reorderVenues(ordered)}
        onEditVenue={(venue) => setVenueDialog({ open: true, venue })}
        onRemoveVenue={(v) => void removeVenue(v)}
        onAddVenue={() => setVenueDialog({ open: true, venue: null })}
      />

      {/* 弹窗们 */}
      {showEdit && (
        <EditMeetingDialog
          meeting={meeting}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false)
            void load()
          }}
        />
      )}
      <VenueDialog
        open={venueDialog.open}
        venue={venueDialog.venue}
        meetingId={meeting.id}
        onClose={() => setVenueDialog({ open: false, venue: null })}
        onSaved={() => {
          setVenueDialog({ open: false, venue: null })
          void load()
        }}
      />
      <SessionDialog
        open={sessionDialog.open}
        venueId={sessionDialog.venueId}
        session={sessionDialog.session}
        defaults={sessionDialog.defaults}
        meetingId={meeting.id}
        venues={venues}
        participants={participants}
        onRemove={(s) => void removeSession(s)}
        onClose={() => setSessionDialog({ open: false, venueId: null, session: null })}
        onSaved={() => {
          setSessionDialog({ open: false, venueId: null, session: null })
          void load()
        }}
      />
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-0.5 text-gray-800">{value}</div>
    </div>
  )
}

function ConflictRow({ level, text }: { level: 'error' | 'warning'; text: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
        level === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
      }`}
    >
      <span className="mt-0.5 shrink-0">{level === 'error' ? '✕' : '⚠'}</span>
      <span>{text}</span>
    </div>
  )
}

// ---------- 编辑会议 ----------

function EditMeetingDialog({
  meeting,
  onClose,
  onSaved,
}: {
  meeting: Meeting
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(meeting.name)
  const [startDate, setStartDate] = useState(meeting.startDate)
  const [endDate, setEndDate] = useState(meeting.endDate)
  const [location, setLocation] = useState(meeting.location ?? '')
  const [description, setDescription] = useState(meeting.description ?? '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (endDate < startDate) {
      setError('结束日期不能早于开始日期')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.patch(`/meetings/${meeting.id}`, {
        name,
        startDate,
        endDate,
        location: location || null,
        description: description || null,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open
      title="编辑会议"
      onClose={onClose}
      footer={<DialogFooter onCancel={onClose} onConfirm={submit} loading={loading} confirmText="保存" />}
    >
      <div className="space-y-4">
        <Field label="会议名称">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="举办地点">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="开始日期">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="结束日期">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <Field label="会议简介">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </Dialog>
  )
}

// ---------- 场地弹窗（日历列） ----------

function VenueDialog({
  open,
  venue,
  meetingId,
  onClose,
  onSaved,
}: {
  open: boolean
  venue: Venue | null
  meetingId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setName(venue?.name ?? '')
      setCapacity(venue?.capacity ? String(venue.capacity) : '')
      setError('')
    }
  }, [open, venue])

  async function submit() {
    if (!name.trim()) {
      setError('请填写场地名称')
      return
    }
    const cap = capacity.trim() ? Number(capacity) : undefined
    if (cap !== undefined && (!Number.isInteger(cap) || cap <= 0)) {
      setError('容纳人数应为正整数')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (venue) {
        await api.patch(`/venues/${venue.id}`, { name: name.trim(), capacity: cap })
      } else {
        await api.post('/venues', { meetingId, name: name.trim(), capacity: cap })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      title={venue ? '编辑场地' : '新增场地'}
      onClose={onClose}
      footer={<DialogFooter onCancel={onClose} onConfirm={submit} loading={loading} confirmText="保存" />}
    >
      <div className="space-y-4">
        <Field label="场地名称" hint="日历中的列，如：主会场 / 第一会议室">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：第一会议室" autoFocus />
        </Field>
        <Field label="容纳人数">
          <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="选填" />
        </Field>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </Dialog>
  )
}

// ---------- 场次弹窗 ----------

function SessionDialog({
  open,
  venueId,
  session,
  defaults,
  meetingId,
  venues,
  participants,
  onRemove,
  onClose,
  onSaved,
}: {
  open: boolean
  venueId: string | null
  session: Session | null
  defaults?: { date: string; startMinutes: number }
  meetingId: string
  venues: Venue[]
  participants: Participant[]
  onRemove: (session: Session) => void
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<Session['type']>('speech')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [description, setDescription] = useState('')
  const [crossTracks, setCrossTracks] = useState(false)
  const [curVenueId, setCurVenueId] = useState<string | null>(venueId)
  // 新建时本地暂存的嘉宾；编辑时直接调接口
  const [newSpeakers, setNewSpeakers] = useState<{ participantId: string; role: Speaker['role'] }[]>([])
  const [addPid, setAddPid] = useState('')
  const [addRole, setAddRole] = useState<Speaker['role']>('speaker')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(session?.title ?? '')
      setType(session?.type ?? 'speech')
      setCurVenueId(session ? session.venueId : venueId)
      setDescription(session?.description ?? '')
      setCrossTracks(session?.crossTracks ?? false)
      setNewSpeakers([])
      setAddPid('')
      setAddRole('speaker')
      setError('')
      if (session) {
        setStartTime(toLocalInputValue(session.startTime))
        setEndTime(toLocalInputValue(session.endTime))
      } else if (defaults) {
        // 由日历空白格点击位置预填：开始向下取整 15 分钟，默认时长 1 小时
        const pad2 = (n: number) => String(n).padStart(2, '0')
        const m = Math.floor(defaults.startMinutes / 15) * 15
        const em = Math.min(m + 60, 23 * 60 + 45)
        setStartTime(`${defaults.date}T${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`)
        setEndTime(`${defaults.date}T${pad2(Math.floor(em / 60))}:${pad2(em % 60)}`)
      } else {
        setStartTime('')
        setEndTime('')
      }
    }
  }, [open, session, venueId, defaults])

  function addLocalSpeaker() {
    if (!addPid) return
    if (newSpeakers.some((s) => s.participantId === addPid)) return
    setNewSpeakers([...newSpeakers, { participantId: addPid, role: addRole }])
    setAddPid('')
  }

  async function submit() {
    if (!title.trim() || !startTime || !endTime) {
      setError('请填写标题与起止时间')
      return
    }
    const startIso = fromLocalInputValue(startTime)
    const endIso = fromLocalInputValue(endTime)
    if (!startIso || !endIso || endIso <= startIso) {
      setError('结束时间必须晚于开始时间')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (session) {
        await api.patch(`/sessions/${session.id}`, {
          venueId: crossTracks ? session.venueId : curVenueId,
          title: title.trim(),
          type,
          startTime: startIso,
          endTime: endIso,
          description: description || null,
          crossTracks,
        })
        // 编辑态：暂存嘉宾逐个挂到已有场次
        for (const sp of newSpeakers) {
          await api.post(`/sessions/${session.id}/speakers`, sp).catch(() => {})
        }
      } else {
        await api.post('/sessions', {
          meetingId,
          venueId: crossTracks ? null : curVenueId,
          title: title.trim(),
          type,
          startTime: startIso,
          endTime: endIso,
          description: description || null,
          crossTracks,
          speakers: newSpeakers,
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setLoading(false)
    }
  }

  const pidName = (pid: string) => participants.find((p) => p.id === pid)?.name ?? pid

  return (
    <Dialog
      open={open}
      title={session ? '编辑场次' : '新增场次'}
      onClose={onClose}
      wide
      footer={
        <>
          {session && (
            <Button
              variant="ghost"
              className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => {
                if (window.confirm(`确定删除场次「${session.title}」？`)) {
                  onClose()
                  onRemove(session)
                }
              }}
            >
              删除场次
            </Button>
          )}
          <DialogFooter onCancel={onClose} onConfirm={submit} loading={loading} confirmText="保存" />
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="场次标题">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </Field>
          </div>
          <Field label="类型">
            <Select value={type} onChange={(e) => setType(e.target.value as Session['type'])}>
              {Object.entries(SESSION_TYPE).map(([v, meta]) => (
                <option key={v} value={v}>
                  {meta.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {!crossTracks && (
          <Field label="场地（日历列）">
            <Select value={curVenueId ?? ''} onChange={(e) => setCurVenueId(e.target.value || null)}>
              <option value="">未指定场地</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="开始时间">
            <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="结束时间">
            <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
        <Field label="简介">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={crossTracks}
            onChange={(e) => setCrossTracks(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          全场环节（横跨所有场地，如签到/茶歇）
        </label>

        <Field label="嘉宾" hint="从通讯录选择，可多人；保存后生效">
          <div className="flex gap-2">
            <Select value={addPid} onChange={(e) => setAddPid(e.target.value)} className="flex-1">
              <option value="">选择人员…</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.orgName ? `（${p.orgName}）` : ''}
                </option>
              ))}
            </Select>
            <Select value={addRole} onChange={(e) => setAddRole(e.target.value as Speaker['role'])} className="w-28">
              {Object.entries(SPEAKER_ROLE).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
            <Button variant="outline" onClick={addLocalSpeaker} disabled={!addPid}>
              添加
            </Button>
          </div>
          {newSpeakers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {newSpeakers.map((sp, i) => (
                <span
                  key={sp.participantId}
                  className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                >
                  {pidName(sp.participantId)}
                  <span className="text-gray-400">{SPEAKER_ROLE[sp.role] ?? sp.role}</span>
                  <button
                    className="text-gray-400 hover:text-red-600 cursor-pointer"
                    onClick={() => setNewSpeakers(newSpeakers.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>

        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </Dialog>
  )
}
