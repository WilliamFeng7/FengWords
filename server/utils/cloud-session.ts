import { createHash } from 'node:crypto'
import {
  createError,
  getCookie,
  getHeader,
  getRequestIP,
  getRequestURL,
  readRawBody,
  setCookie,
  setHeader,
  type H3Event,
} from 'h3'
import { MAX_BODY_BYTES, parseRecoveryCode } from '#shared/cloud'
import { cloudDb } from './cloud-db'

export const SESSION_COOKIE = 'fw_cloud_session'
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export function privateResponse(event: H3Event) {
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'Vary', 'Cookie')
}

export function requireSameOrigin(event: H3Event) {
  privateResponse(event)
  if (getHeader(event, 'x-fengwords') !== '1' || getHeader(event, 'sec-fetch-site') === 'cross-site') {
    throw createError({ statusCode: 403, statusMessage: 'cloud_forbidden' })
  }
  const origin = getHeader(event, 'origin')
  if (origin) {
    try {
      if (new URL(origin).host !== getRequestURL(event).host) throw new Error()
    } catch {
      throw createError({ statusCode: 403, statusMessage: 'cloud_forbidden' })
    }
  }
}

export async function jsonBody(event: H3Event): Promise<any> {
  if (Number(getHeader(event, 'content-length') || 0) > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'cloud_payload_too_large' })
  }
  const raw = await readRawBody(event)
  if (!raw || Buffer.byteLength(raw) > MAX_BODY_BYTES)
    throw createError({ statusCode: 413, statusMessage: 'cloud_payload_too_large' })
  try {
    return JSON.parse(raw)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'cloud_invalid_data' })
  }
}

export async function validateCode(code: unknown): Promise<string> {
  const parsed = parseRecoveryCode(code)
  if (!parsed) throw createError({ statusCode: 401, statusMessage: 'cloud_invalid_code' })
  const sql = cloudDb()
  const rows =
    await sql`SELECT id FROM fw_workspaces WHERE id = ${parsed.id} AND access_hash = ${hashToken(parsed.token)}`
  if (!rows.length) throw createError({ statusCode: 401, statusMessage: 'cloud_invalid_code' })
  return parsed.id
}

export async function requireWorkspace(event: H3Event, checkExpected = false): Promise<string> {
  privateResponse(event)
  const id = await validateCode(getCookie(event, SESSION_COOKIE))
  const expected = getHeader(event, 'x-fw-workspace')
  if (checkExpected && expected && expected !== id)
    throw createError({ statusCode: 409, statusMessage: 'cloud_workspace_changed' })
  return id
}

export function saveSession(event: H3Event, code: string) {
  setCookie(event, SESSION_COOKIE, code, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!process.env.VERCEL || getRequestURL(event).protocol === 'https:',
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  })
}

// Shared, persistent throttling works across Vercel function instances.
export async function rateLimit(event: H3Event, action: string, limit: number, seconds: number, workspace?: string) {
  const identity = workspace || getRequestIP(event, { xForwardedFor: !!process.env.VERCEL }) || 'local'
  const key = hashToken(`${action}:${identity}`)
  const sql = cloudDb()
  const [row] = await sql`
    INSERT INTO fw_rate_limits (key, hits, reset_at) VALUES (${key}, 1, clock_timestamp() + ${seconds} * interval '1 second')
    ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN fw_rate_limits.reset_at < clock_timestamp() THEN 1 ELSE fw_rate_limits.hits + 1 END,
      reset_at = CASE WHEN fw_rate_limits.reset_at < clock_timestamp() THEN EXCLUDED.reset_at ELSE fw_rate_limits.reset_at END
    RETURNING hits`
  if (row!.hits > limit) {
    setHeader(event, 'Retry-After', seconds)
    throw createError({ statusCode: 429, statusMessage: 'cloud_rate_limited' })
  }
}
