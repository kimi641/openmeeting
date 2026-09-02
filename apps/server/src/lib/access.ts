import { eq } from 'drizzle-orm'
import { db } from '../db'
import {
  meetings,
  organizations,
  participants,
  sessionOrganizers,
  sessions,
  sessionSpeakers,
  sessionTypes,
  venues,
} from '../db/schema'
import { notFound } from './http'
import type { CurrentUser } from './auth'

/**
 * 数据隔离核心：member 仅可见/可操作本人创建的会议及其下属资源，admin 全量。
 * 无权限的资源统一返回 404（与不存在一致，避免泄露资源存在性）。
 */

/** 会议列表过滤条件：admin 不过滤，member 仅本人创建 */
export function meetingScope(user: CurrentUser) {
  return user.role === 'admin' ? undefined : eq(meetings.createdBy, user.id)
}

export function getAccessibleMeeting(user: CurrentUser, meetingId: string) {
  const meeting = db.select().from(meetings).where(eq(meetings.id, meetingId)).get()
  if (!meeting) throw notFound('会议')
  if (user.role !== 'admin' && meeting.createdBy !== user.id) throw notFound('会议')
  return meeting
}

export function getAccessibleSession(user: CurrentUser, sessionId: string) {
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
  if (!session) throw notFound('场次')
  getAccessibleMeeting(user, session.meetingId)
  return session
}

export function getAccessibleVenue(user: CurrentUser, venueId: string) {
  const venue = db.select().from(venues).where(eq(venues.id, venueId)).get()
  if (!venue) throw notFound('场地')
  getAccessibleMeeting(user, venue.meetingId)
  return venue
}

export function getAccessibleParticipant(user: CurrentUser, participantId: string) {
  const participant = db.select().from(participants).where(eq(participants.id, participantId)).get()
  if (!participant) throw notFound('人员')
  getAccessibleMeeting(user, participant.meetingId)
  return participant
}

export function getAccessibleOrganization(user: CurrentUser, organizationId: string) {
  const organization = db.select().from(organizations).where(eq(organizations.id, organizationId)).get()
  if (!organization) throw notFound('组织')
  getAccessibleMeeting(user, organization.meetingId)
  return organization
}

export function getAccessibleSessionType(user: CurrentUser, sessionTypeId: string) {
  const row = db.select().from(sessionTypes).where(eq(sessionTypes.id, sessionTypeId)).get()
  if (!row) throw notFound('活动类型')
  getAccessibleMeeting(user, row.meetingId)
  return row
}

export function getAccessibleSpeaker(user: CurrentUser, speakerId: string) {
  const row = db.select().from(sessionSpeakers).where(eq(sessionSpeakers.id, speakerId)).get()
  if (!row) throw notFound('场次嘉宾')
  getAccessibleSession(user, row.sessionId)
  return row
}

export function getAccessibleOrganizer(user: CurrentUser, organizerId: string) {
  const row = db.select().from(sessionOrganizers).where(eq(sessionOrganizers.id, organizerId)).get()
  if (!row) throw notFound('场次主办方')
  getAccessibleSession(user, row.sessionId)
  return row
}
