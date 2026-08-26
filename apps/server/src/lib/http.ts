import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** 统一业务错误：onError 中转换为 { error: { code, message } } */
export class ApiError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export function notFound(what: string): ApiError {
  return new ApiError(404, 'NOT_FOUND', `${what}不存在`)
}

export function badRequest(message: string): ApiError {
  return new ApiError(400, 'BAD_REQUEST', message)
}

export function unauthorized(message = '未登录或会话已过期'): ApiError {
  return new ApiError(401, 'UNAUTHORIZED', message)
}

export function forbidden(message = '无权限执行此操作'): ApiError {
  return new ApiError(403, 'FORBIDDEN', message)
}

export function jsonOk<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json(data as object, status)
}
