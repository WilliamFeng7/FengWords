import { readFile } from 'node:fs/promises'
import { neon } from '@neondatabase/serverless'

// No destructive migration; schema changes are explicitly run, never run from a browser request.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required. Run vercel env pull .env.local --yes.')
const sql = neon(url)
const source = await readFile(new URL('../server/database/schema.sql', import.meta.url), 'utf8')
const statements = source
  .split(';')
  .map(s => s.trim())
  .filter(Boolean)
await sql.transaction(statements.map(statement => sql.query(statement)))
console.log(`Database migration succeeded (${statements.length} non-destructive statements).`)
