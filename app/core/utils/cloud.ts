import { reactive } from 'vue'
import { useRuntimeStore } from '../stores/runtime'
import { withAppBaseURL } from './base-url'
import type { CloudListOptions, CloudPage, CloudRow } from '#shared/cloud'

export const cloudState = reactive({
  enabled: true,
  ready: false,
  paused: false,
  workspaceId: '',
  status: 'idle' as 'idle' | 'syncing' | 'success' | 'error',
  errorCode: '',
  lastSyncedAt: 0,
})

export async function cloudRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(withAppBaseURL('/api/cloud/' + path), {
      method: options.method || 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-FengWords': '1',
        ...(cloudState.workspaceId ? { 'X-FW-Workspace': cloudState.workspaceId } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    })
    const result = await response.json()
    if (result.statusMessage === 'cloud_workspace_changed') cloudState.paused = true
    if (!response.ok)
      throw new Error(result.statusMessage?.startsWith('cloud_') ? result.statusMessage : 'cloud_unavailable')
    return result
  } finally {
    clearTimeout(timeout)
  }
}

// A real same-origin transport, not a browser-side database SDK. Credentials stay on the server.
export class CloudClient {
  async list(options: CloudListOptions = {}): Promise<CloudPage> {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) query.set(key, Array.isArray(value) ? JSON.stringify(value) : String(value))
    }
    return cloudRequest('records?' + query)
  }

  async upsert(
    rows: Array<{ type: string; data: any; data_version?: number; updated_at?: string }>
  ): Promise<string[]> {
    const accepted: string[] = []
    // Bound both row count and bytes; a large imported dictionary is uploaded as multiple requests.
    let batch: typeof rows = []
    let bytes = 20
    const send = async () => {
      if (!batch.length) return
      const result = await cloudRequest<{ accepted: string[] }>('records', { method: 'PUT', body: { rows: batch } })
      accepted.push(...result.accepted)
      batch = []
      bytes = 20
    }
    for (const row of rows) {
      const size = new TextEncoder().encode(JSON.stringify(row)).byteLength + 1
      if (size > 1_900_000) throw new Error('cloud_payload_too_large')
      if (batch.length >= 300 || bytes + size > 1_900_000) await send()
      batch.push(row)
      bytes += size
    }
    await send()
    return accepted
  }

  async getTypes(types: string[]): Promise<CloudRow[]> {
    return (await this.list({ types })).rows
  }
}

const client = new CloudClient()
let initializing: Promise<{ workspaceId: string; hasRecords: boolean } | null> | null = null

export class Cloud {
  static isConfigured() {
    return cloudState.enabled
  }
  static check() {
    return cloudState.ready && !cloudState.paused
  }
  static getInstance() {
    return client
  }
  static getStatus() {
    return { status: cloudState.status, statusMessage: cloudState.errorCode }
  }

  static setStatus(status: typeof cloudState.status, errorCode = '') {
    cloudState.status = status
    cloudState.errorCode = errorCode.startsWith('cloud_') ? errorCode : status === 'error' ? 'cloud_unavailable' : ''
    if (status === 'success') cloudState.lastSyncedAt = Date.now()
    useRuntimeStore().isError = status === 'error'
  }

  static initialize() {
    if (initializing) return initializing
    initializing = (async () => {
      try {
        this.setStatus('syncing')
        const status = await cloudRequest<{ configured: boolean }>('status')
        cloudState.enabled = status.configured
        if (!status.configured) throw new Error('cloud_not_configured')
        const session = await cloudRequest<{ workspaceId: string; hasRecords: boolean }>('session', {
          method: 'POST',
          body: {},
        })
        cloudState.workspaceId = session.workspaceId
        cloudState.ready = true
        return session
      } catch (e) {
        cloudState.ready = false
        this.setStatus('error', (e as Error).message)
        return null
      }
    })().finally(() => {
      initializing = null
    })
    return initializing
  }
}
