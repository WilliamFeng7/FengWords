import { APP_VERSION } from '../config/env'
import { useBaseStore, useRuntimeStore, useSettingStore } from '../stores'
import { Cloud, cloudState } from '../utils/cloud'
import { ensureHashGuardBeforeInit, pruneLocalAudioFiles, useDataSyncPersistence } from './useDataSyncPersistence'
import { SyncDataType } from '../types'
import {
  consumeOtherTabWrites,
  flushSave,
  reloadFromDb,
  requestPersistentStorage,
  watchStoreChanges,
} from '../persistence/store-persistence'
import { prepareCloudMigration, schedulePush, syncRecords } from '../persistence/record-sync'
import { flushSettings, markSettingsSaved, scheduleSettingsSave } from '../persistence/settings-persistence'
import { saveCloudExtras } from '../persistence/cloud-extras'

const SYNC_WAIT_AT_START = 3000

let stopDictWatch: (() => void) | null = null
let stopSettingWatch: (() => void) | null = null
let lifecycleBound = false
let cloudRun: Promise<void> | null = null

/** One retry path for startup, reconnect, the Settings button and periodic multi-device refresh. */
export function syncAllCloud(): Promise<void> {
  if (cloudState.paused) return Promise.resolve()
  if (cloudRun) return cloudRun
  cloudRun = (async () => {
    if (!Cloud.check()) {
      const session = await Cloud.initialize()
      if (!session) return
    }
    await prepareCloudMigration(cloudState.workspaceId)
    await syncRecords()
    await saveCloudExtras(true)
    await useDataSyncPersistence().syncData({
      [SyncDataType.setting]: null,
      [SyncDataType.practice_word]: null,
      [SyncDataType.practice_article]: null,
    })
  })()
    .catch(e => Cloud.setStatus('error', e.message))
    .finally(() => {
      cloudRun = null
    })
  return cloudRun
}

/**
 * 离开页面（切到后台、关闭、手机锁屏）时立刻保存；回到页面时读入别处的改动。
 * 以前是“页面不在前台就不保存”，改动要等下一次改动才存上；现在反过来，离开时一定存。
 */
function bindLifecycle() {
  if (lifecycleBound) return
  lifecycleBound = true
  const leave = () => {
    if (cloudState.paused) return
    flushSave({ deep: true }).catch(() => {})
    void flushSettings()
  }
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
      leave()
      schedulePush(0)
      return
    }
    // 另一个标签页改过数据：先读进来，免得这里显示的是旧的
    if (consumeOtherTabWrites()) await reloadFromDb().catch(e => console.warn('[persist] 重新读取失败', e))
    void syncAllCloud()
  })
  window.addEventListener('pagehide', leave)
  window.addEventListener('storage', event => {
    if (event.key !== 'fw-cloud-switch') return
    cloudState.paused = true
    if (event.newValue !== 'switching') window.location.reload()
  })
  window.addEventListener('online', () => {
    void syncAllCloud()
  })
  setInterval(() => {
    if (!document.hidden) void syncAllCloud()
  }, 30_000)
}

export function useInit() {
  const store = useBaseStore()
  const settingStore = useSettingStore()
  const runtimeStore = useRuntimeStore()
  const dataSync = useDataSyncPersistence()
  let initializing = false // 标记是否正在初始化

  //init 有可能重复执行，因为从老网站导了数据之后需要 init
  async function init() {
    if (initializing) return
    initializing = true
    console.time('init')

    //先停掉之前的监听，避免重复保存
    stopDictWatch?.()
    stopSettingWatch?.()
    stopDictWatch = stopSettingWatch = null

    try {
      await ensureHashGuardBeforeInit()
      await store.init()
      const settingData = await settingStore.init()
      if (!settingData)
        await dataSync.saveLocalAndSync(SyncDataType.setting, settingStore.$state, { canSyncRemote: false })
      markSettingsSaved(settingStore.$state)
      // 开了云同步：启动时先同步一下，但最多等 SYNC_WAIT_AT_START；网络慢就先用本地数据，同步在后台做完再更新
      const sync = syncAllCloud()
      await Promise.race([sync, new Promise(r => setTimeout(r, SYNC_WAIT_AT_START))])
      pruneLocalAudioFiles(store.$state).catch(e => console.warn('清理本地音频失败', e))
    } finally {
      settingStore.load = true
      store.load = true
      console.timeEnd('init')
      initializing = false
    }

    //等数据全部准备好，再开启监听
    stopDictWatch = watchStoreChanges()
    stopSettingWatch = settingStore.$subscribe(() => scheduleSettingsSave(), { detached: true })
    bindLifecycle()

    runtimeStore.isNew = APP_VERSION.version > Number(settingStore.webAppVersion)
    // runtimeStore.isNew = true
    runtimeStore.isError = Cloud.getStatus().status === 'error'
    window.umami?.track('host', { host: window.location.host })
    void requestPersistentStorage()
  }

  return init
}
