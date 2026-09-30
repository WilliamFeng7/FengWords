import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { createError } from 'h3'

let sql: NeonQueryFunction<false, false> | null = null
export function cloudDb() {
  if (!process.env.DATABASE_URL) throw createError({ statusCode: 503, statusMessage: 'cloud_not_configured' })
  return (sql ??= neon(process.env.DATABASE_URL))
}
