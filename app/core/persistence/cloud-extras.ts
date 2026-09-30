import { get, set } from 'idb-keyval'
import { PARKED_PRACTICE_KEY, PRACTICE_FLOW_STORAGE_KEY } from '../config/env'
import { recordTable } from './db'
import { hashString } from './hash'

export const EXTRAS_KEY = 'practice-extras'
export async function saveCloudExtras(onlyIfMissing = false): Promise<void> {
  const table = recordTable('state')
  const current = await table.get(EXTRAS_KEY)
  if (onlyIfMissing && current) return
  let flows: unknown = null
  try {
    flows = JSON.parse(localStorage.getItem(PRACTICE_FLOW_STORAGE_KEY) || 'null')
  } catch {
    /* retain empty */
  }
  const parked = (await get(PARKED_PRACTICE_KEY)) || []
  if (onlyIfMissing && !flows && !parked.length) return
  const v = { flows, parked }
  const h = hashString(JSON.stringify(v))
  if (current?.h === h) return
  await table.put({ key: EXTRAS_KEY, v, h, t: Date.now(), dirty: 1 })
  const { schedulePush } = await import('./record-sync')
  schedulePush()
}

export async function applyCloudExtras(): Promise<void> {
  const row = await recordTable('state').get(EXTRAS_KEY)
  if (!row || row.del) return
  if (Array.isArray(row.v?.parked)) await set(PARKED_PRACTICE_KEY, row.v.parked)
  if (row.v?.flows) localStorage.setItem(PRACTICE_FLOW_STORAGE_KEY, JSON.stringify(row.v.flows))
  else localStorage.removeItem(PRACTICE_FLOW_STORAGE_KEY)
}
