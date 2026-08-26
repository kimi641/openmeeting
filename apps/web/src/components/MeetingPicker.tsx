import { useEffect, useState } from 'react'
import { api, type ListResult, type Meeting } from '../lib/api'
import { Select } from './ui/form'

/** 会议选择器：场地/通讯录等会议级资源页共用（自动加载会议列表） */
export function MeetingPicker({
  value,
  onChange,
  onLoaded,
}: {
  value: string
  onChange: (id: string) => void
  onLoaded?: (meetings: Meeting[]) => void
}) {
  const [meetings, setMeetings] = useState<Meeting[]>([])

  useEffect(() => {
    api
      .get<ListResult<Meeting>>('/meetings?pageSize=100')
      .then((r) => {
        setMeetings(r.data)
        onLoaded?.(r.data)
      })
      .catch(() => onLoaded?.([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Select
      className="w-64"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="切换会议（场地/通讯录按会议隔离）"
    >
      <option value="">选择会议…</option>
      {meetings.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </Select>
  )
}
