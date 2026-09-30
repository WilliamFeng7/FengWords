import { toRaw } from 'vue'
import { useSettingStore } from '../stores/setting'
import { SyncDataType } from '../types/enum'
import { useDataSyncPersistence } from '../composables/useDataSyncPersistence'
import { cloudState } from '../utils/cloud'

/**
 * 设置的保存：仍是一个小文档（约 3KB），按原来的方式存本地、同步云端。
 * 和学习数据一样不再“碰上忙就跳过”：串行保存、失败重试、离开页面立刻保存；内容没变就不写。
 */

const DELAY = 800
const RETRY_DELAY = 3000

let timer: ReturnType<typeof setTimeout> | null = null
let chain: Promise<void> = Promise.resolve()
let lastJson = ''

function snapshot(state: object): string {
  const { load: _load, _ignoreWatch: _ignore, ...rest } = toRaw(state) as any
  return JSON.stringify(rest)
}

/** 这份设置已经在本地了（刚读出来 / 刚从云端拉下来），不用再存 */
export function markSettingsSaved(state: object): void {
  lastJson = snapshot(state)
}

export function scheduleSettingsSave(delay = DELAY): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void flushSettings()
  }, delay)
}

export function flushSettings(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  chain = chain.then(async () => {
    if (cloudState.paused) return
    const json = snapshot(useSettingStore().$state)
    if (json === lastJson) return
    const previous = lastJson
    lastJson = json
    try {
      await useDataSyncPersistence().saveLocalAndSync(SyncDataType.setting, JSON.parse(json))
    } catch (e) {
      console.error('[settings] 设置保存失败', e)
      lastJson = previous
      scheduleSettingsSave(RETRY_DELAY)
    }
  })
  return chain
}
