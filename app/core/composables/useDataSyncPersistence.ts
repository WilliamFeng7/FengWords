import { checkAndUpgradeSaveDict, checkAndUpgradeSaveSetting, shakeCommonDict, shouldFetchRemote } from '../utils'
import {
  getPracticeArticleCacheLocal,
  getPracticeArticleCacheLocalWithMeta,
  getPracticeWordCacheLocal,
  getPracticeWordCacheLocalWithMeta,
  PRACTICE_ARTICLE_CACHE,
  PRACTICE_WORD_CACHE,
  type PracticeArticleCache,
  type PracticeWordCacheStored,
  setPracticeArticleCacheLocal,
  setPracticeWordCacheLocal,
} from '../utils/cache'
import {
  APP_VERSION,
  BACKUP_INDEX_KEY,
  BACKUP_KEY,
  DictId,
  LOCAL_FILE_KEY,
  PARKED_PRACTICE_KEY,
  PRACTICE_FLOW_STORAGE_KEY,
  SAVE_DICT_KEY,
  SAVE_SETTING_KEY,
  WEBSITE_VERSION_HASH,
} from '../config/env'
import { type BaseState, getDefaultBaseState, getDefaultSettingState, useBaseStore, useSettingStore } from '../stores'
import type { BackupData, SaveData, Snapshot } from '../types/types.ts'
import { SyncDataType, CompareResult } from '../types/enum'
import { Cloud, type CloudClient } from '../utils/cloud'
import { del, get, set } from 'idb-keyval'
import {
  ensureStudyContentLoaded,
  flushSave,
  getDictSnapshotJson,
  replaceAllData,
  requestPersistentStorage,
} from '../persistence/store-persistence'
import { replaceLocalWithRemote, replaceRemoteWithLocal, schedulePush } from '../persistence/record-sync'
import { markSettingsSaved } from '../persistence/settings-persistence'
import { saveCloudExtras } from '../persistence/cloud-extras'

type RemoteMetaRow = {
  type: SyncDataType
  updated_at?: string
  data_version?: number
}

type RemoteDataRow = RemoteMetaRow & {
  data: any
}

type LocalPersistMeta = {
  updated_at?: string
  version?: number
}

type SaveLocalAndSyncOptions = {
  client?: CloudClient | null
  pullWhenRemoteNewer?: boolean
  pushWhenLocalNewer?: boolean
  canSyncRemote?: boolean
}

const DICT_SYNC_BLOCK_REASON = '检测到自定义文章里面有自定义音频，无法使用同步功能'

const ALL_SYNC_TYPES: SyncDataType[] = [
  SyncDataType.dict,
  SyncDataType.setting,
  SyncDataType.practice_word,
  SyncDataType.practice_article,
]

function getDataVersion(type: SyncDataType): number {
  switch (type) {
    case SyncDataType.dict:
      return SAVE_DICT_KEY.version
    case SyncDataType.setting:
      return SAVE_SETTING_KEY.version
    case SyncDataType.practice_word:
      return PRACTICE_WORD_CACHE.version
    case SyncDataType.practice_article:
      return PRACTICE_ARTICLE_CACHE.version
  }
}

function getPersistKey(type: SyncDataType): string {
  return type === SyncDataType.dict ? SAVE_DICT_KEY.key : SAVE_SETTING_KEY.key
}

function getSyncClient(client?: CloudClient | null): CloudClient | null {
  if (client) return client
  if (!Cloud.check()) return null
  return Cloud.getInstance() as CloudClient
}

async function getLocalPersistMeta(type: SyncDataType): Promise<LocalPersistMeta | null> {
  if (type === SyncDataType.practice_word) {
    return await getPracticeWordCacheLocalWithMeta()
  }
  if (type === SyncDataType.practice_article) {
    return await getPracticeArticleCacheLocalWithMeta()
  }
  const raw = await get(getPersistKey(type))
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function persistLocalState(type: SyncDataType, val: unknown, updated_at?: string): Promise<void> {
  // console.log('persistLocalState',type,updated_at)
  if (type === SyncDataType.practice_word) {
    await setPracticeWordCacheLocal(val as PracticeWordCacheStored, updated_at)
    return
  }
  if (type === SyncDataType.practice_article) {
    await setPracticeArticleCacheLocal(val as PracticeArticleCache, updated_at)
    return
  }
  await set(
    getPersistKey(type),
    JSON.stringify({
      val,
      version: getDataVersion(type),
      updated_at,
    })
  )
}

/** 云端旧格式（整块）的词典数据：整体写入本地分表，再读入界面 */
async function applyDictData(store: ReturnType<typeof useBaseStore>, data: BaseState, updatedAt?: string) {
  const t = Date.parse(updatedAt ?? '')
  await replaceAllData(data, { t: Number.isFinite(t) ? t : undefined })
  store.setState(data)
  void ensureStudyContentLoaded()
}

async function fetchServerMeta(types: SyncDataType[], client?: CloudClient | null): Promise<RemoteMetaRow[] | null> {
  const sb = getSyncClient(client)
  if (!sb) return null
  try {
    return (await sb.list({ types, metadata: true })).rows as RemoteMetaRow[]
  } catch (error) {
    Cloud.setStatus('error', (error as Error).message)
    return null
  }
}

async function fetchServerDatas(types: SyncDataType[], client?: CloudClient | null): Promise<RemoteDataRow[]> {
  const sb = getSyncClient(client)
  if (!sb) return []
  return (await sb.getTypes(types)) as RemoteDataRow[]
}

async function compareResultByType(
  type: SyncDataType,
  remoteMetaMap: Map<SyncDataType, RemoteMetaRow>,
  localMeta?: LocalPersistMeta
): Promise<CompareResult> {
  const remoteMeta = remoteMetaMap.get(type)
  if (!remoteMeta) return CompareResult.NoRemote
  if (localMeta == null) {
    localMeta = await getLocalPersistMeta(type)
  }
  if (!localMeta) {
    if (remoteMeta.data_version == null) {
      return CompareResult.NoRemote
    } else {
      //如果本地没数据，但远程有版本号，则远程新
      return CompareResult.RemoteNewer
    }
  }
  //如果本地没有更新日期，那必定是刚更新版本，updated_at和sb 一起上线，这里特殊处理即可
  if (!localMeta?.updated_at) return CompareResult.LocalNewer
  const currentVersion = getDataVersion(type)
  return shouldFetchRemote(localMeta.updated_at, remoteMeta.updated_at, remoteMeta.data_version, currentVersion)
}

async function upsertServerDatas(rows: RemoteDataRow[], client?: CloudClient | null): Promise<boolean> {
  const sb = getSyncClient(client)
  if (!sb) return false
  try {
    await sb.upsert(rows)
    return true
  } catch (e) {
    Cloud.setStatus('error', (e as Error).message)
    return false
  }
}

async function applyRemoteDataByType(
  type: SyncDataType,
  row: RemoteDataRow,
  store: ReturnType<typeof useBaseStore>,
  settingStore: ReturnType<typeof useSettingStore>
): Promise<void> {
  if (!row) return
  const now = new Date().toISOString()
  if (type === SyncDataType.setting) {
    const normalized = await checkAndUpgradeSaveSetting({
      val: row.data,
      version: row.data_version,
    })
    normalized.load = true
    settingStore.setState(normalized)
    markSettingsSaved(normalized)
    await persistLocalState(SyncDataType.setting, normalized, row.updated_at ?? now)
    return
  }
  if (type === SyncDataType.dict) {
    const normalized = await checkAndUpgradeSaveDict({
      val: row.data,
      version: row.data_version,
    })
    normalized.load = true
    await applyDictData(store, normalized, row.updated_at)
    return
  }
  await persistLocalState(type, row.data, row.updated_at ?? now)
}

/** 自定义文章里有本地音频（没有地址、只存在本机）时不能同步 */
function getLocalAudioFileIds(state: BaseState): string[] {
  const ids: string[] = []
  for (const book of state.article.bookList) {
    if (!book.custom && !book.system) continue
    for (const a of book.articles) if (!a.audioSrc && a.audioFileId) ids.push(a.audioFileId)
  }
  return ids
}

export function getDictSyncBlockReason(state: BaseState): string | null {
  return getLocalAudioFileIds(state).length ? DICT_SYNC_BLOCK_REASON : null
}

/** 清理没有文章再用到的本地音频（原来每次保存词典时顺带做，现在启动时做一次） */
export async function pruneLocalAudioFiles(state: BaseState): Promise<void> {
  const ids = new Set(getLocalAudioFileIds(state))
  if (!ids.size) return
  const files = ((await get(LOCAL_FILE_KEY)) as Array<{ id: string; file: Blob }> | undefined) ?? []
  const kept = files.filter(f => ids.has(f.id))
  if (kept.length !== files.length) await set(LOCAL_FILE_KEY, kept)
}

type HashBackupIndexItem = {
  hash: string
  key: string
  createdAt: number
}

function normalizeHash(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  return v.length > 0 ? v : null
}

export async function ensureHashGuardBeforeInit() {
  //@ts-ignore
  const runtimeConfig = useRuntimeConfig()

  try {
    const currentHash = normalizeHash(runtimeConfig?.public?.latestCommitHash)
    if (!currentHash) return

    const localHash = normalizeHash(await get(WEBSITE_VERSION_HASH))
    let res = true
    if (localHash !== currentHash) {
      res = await saveHashSnapshot(localHash ?? currentHash, '')
    }
    res && (await set(WEBSITE_VERSION_HASH, currentHash))
  } catch (e) {
    console.warn('init hash guard failed', e)
  }
}

export async function saveHashSnapshot(currentHash: string, previousHash: string | null): Promise<boolean> {
  const backupKey = `${BACKUP_KEY}${currentHash}`
  const createdAt = Date.now()

  const snapshot: Snapshot = {
    meta: {
      currentHash,
      previousHash,
      createdAt,
    },
    data: {
      dict: await getDictSnapshotJson(),
      setting: await get(SAVE_SETTING_KEY.key),
      [PRACTICE_WORD_CACHE.key]: (await get(PRACTICE_WORD_CACHE.key)) ?? null,
      [PRACTICE_ARTICLE_CACHE.key]: (await get(PRACTICE_ARTICLE_CACHE.key)) ?? null,
    },
  }
  if (!snapshot.data.dict) {
    return false
  }
  await set(backupKey, snapshot)

  const rawIndex = (await get(BACKUP_INDEX_KEY)) as HashBackupIndexItem[] | undefined
  const index = Array.isArray(rawIndex)
    ? rawIndex.filter(item => item && typeof item.hash === 'string' && typeof item.key === 'string')
    : []

  let rIndex = index.findIndex(item => item.hash === currentHash)
  if (rIndex === -1) {
    index.push({ hash: currentHash, key: backupKey, createdAt })
  } else {
    index[rIndex] = { hash: currentHash, key: backupKey, createdAt }
  }

  if (index.length > 15) {
    index.sort((a, b) => a.createdAt - b.createdAt)
    const removed = index.splice(0, index.length - 10)
    for (const item of removed) {
      await del(item.key)
    }
  }
  await set(BACKUP_INDEX_KEY, index)
  return true
}

export function useDataSyncPersistence() {
  const store = useBaseStore()
  const settingStore = useSettingStore()

  async function pullIfRemoteNewer(type: SyncDataType, client?: CloudClient | null): Promise<RemoteDataRow | null> {
    const remoteMetas = await fetchServerMeta([type], client)
    if (!remoteMetas) return null
    const remoteMetaMap = new Map(remoteMetas.map(item => [item.type, item]))
    const compareResult = await compareResultByType(type, remoteMetaMap)
    console.log('pullIfRemoteNewer-compareResult', CompareResult[compareResult], type)
    if (compareResult === CompareResult.RemoteNewer) {
      const remoteData = await fetchServerDatas([type], client)
      if (remoteData?.length) {
        await applyRemoteDataByType(type, remoteData[0], store, settingStore)
        return remoteData[0]
      }
    }
    return null
  }

  // 同步数据，远程新则拉取（默认），本地新则推送（默认）
  async function syncData(
    localData: Partial<Record<SyncDataType, SaveData | null>>,
    options?: SaveLocalAndSyncOptions
  ) {
    try {
      // 词典数据改为按条同步（persistence/record-sync），这里只处理设置等整行数据
      localData = Object.fromEntries(Object.entries(localData).filter(([type]) => type !== SyncDataType.dict))
      if (!Object.keys(localData).length) return
      const remoteMetas = await fetchServerMeta(Object.keys(localData) as any)
      if (!remoteMetas) return
      const remoteMetaMap = new Map(remoteMetas.map(item => [item.type, item]))
      let pull = []
      let push = []
      for (const type of Object.keys(localData)) {
        const compareResult = await compareResultByType(type as SyncDataType, remoteMetaMap)
        console.log('syncData-compareResult', CompareResult[compareResult], type)
        if (compareResult === CompareResult.RemoteNewer) {
          pull.push(type)
        }
        if ([CompareResult.LocalNewer, CompareResult.NoRemote].includes(compareResult)) {
          push.push(type)
        }
      }

      if (pull.length) {
        const rows = await fetchServerDatas(pull)
        for (const item of rows) {
          await applyRemoteDataByType(item.type, item, store, settingStore)
        }
      }

      if (push.length && options?.pushWhenLocalNewer !== false) {
        let rows = []
        for (const type of push) {
          const item = localData[type] ?? ((await getLocalPersistMeta(type)) as any)
          if (!item || !('val' in item)) continue
          const updated_at = item.updated_at || new Date().toISOString()
          if (!item.updated_at) await persistLocalState(type as SyncDataType, item.val, updated_at)
          rows.push({
            type,
            data: item.val,
            data_version: item.version || getDataVersion(type as SyncDataType),
            updated_at,
          })
        }
        if (rows.length) await upsertServerDatas(rows)
      }

      if (Cloud.getStatus().status !== 'error') {
        Cloud.setStatus('success')
      }
    } catch (error) {
      Cloud.setStatus('error', error?.message ?? String(error))
    }
  }

  async function saveLocalAndSync(type: SyncDataType, data: unknown, options?: SaveLocalAndSyncOptions) {
    try {
      //先取出本地数据的meta值，以用后续与云端数据比较
      const localMeta = await getLocalPersistMeta(type)
      // console.log('saveLocalAndSync-localMeta', localMeta)
      //先保存，再同步
      const updated_at = new Date().toISOString()
      await persistLocalState(type, data, updated_at)

      const canSyncRemote = options?.canSyncRemote !== false
      if (!canSyncRemote) return
      const remoteMetas = await fetchServerMeta([type], options?.client)
      if (!remoteMetas) return
      const remoteMetaMap = new Map(remoteMetas.map(item => [item.type, item]))
      // console.log('saveLocalAndSync-remoteMetaMap', remoteMetaMap.get(type))
      const compareResult = await compareResultByType(type, remoteMetaMap, localMeta)
      console.log('saveLocalAndSync-compareResult', CompareResult[compareResult], type)
      //如果云端数据较新并允许拉取，则拉取云端数据，之后不再上传本地数据
      if (compareResult === CompareResult.RemoteNewer && options?.pullWhenRemoteNewer !== false) {
        const remoteData = await fetchServerDatas([type], options?.client)
        if (remoteData?.length) {
          await applyRemoteDataByType(type, remoteData[0], store, settingStore)
        }
        //防止后端数据为空，本地强制上传了
        return
      }
      const data_version = getDataVersion(type)
      await upsertServerDatas([{ type, data, data_version, updated_at }], options?.client)
    } finally {
      if (Cloud.check() && Cloud.getStatus()?.status !== 'error') {
        Cloud.setStatus('success')
      }
    }
  }

  async function getRemoteData(type: SyncDataType, client?: CloudClient | null): Promise<RemoteDataRow | null> {
    const rows = await fetchServerDatas([type], client)
    return rows?.[0] ?? null
  }

  async function getRemoteMeta(type: SyncDataType, client?: CloudClient | null): Promise<RemoteMetaRow | null> {
    const rows = await fetchServerMeta([type], client)
    return rows?.[0] ?? null
  }

  /**
   * 以给定数据整体覆盖（导入、恢复历史、清空、首次同步选“以本地为准”）。
   * 先写本地（一定生效），再覆盖云端；返回云端是否成功。
   */
  async function forcePushLocalDataToRemote(data: BackupData['val'], client?: CloudClient | null): Promise<boolean> {
    const updated_at = new Date().toISOString()
    await replaceAllData(data.dict.val)
    if (data.practiceFlow) localStorage.setItem(PRACTICE_FLOW_STORAGE_KEY, JSON.stringify(data.practiceFlow))
    if (data.parkedPracticeWord) await set(PARKED_PRACTICE_KEY, data.parkedPracticeWord)
    await saveCloudExtras()
    await persistLocalState(SyncDataType.setting, data.setting.val, updated_at)
    //@ts-ignore
    await persistLocalState(SyncDataType.practice_word, data?.[PRACTICE_WORD_CACHE.key]?.val ?? null, updated_at)
    //@ts-ignore
    await persistLocalState(SyncDataType.practice_article, data?.[PRACTICE_ARTICLE_CACHE.key]?.val ?? null, updated_at)
    markSettingsSaved(data.setting.val)

    const sb = getSyncClient(client)
    if (!sb) return false
    const rows: Array<{ type: SyncDataType; data: unknown; data_version: number; updated_at: string }> = [
      { type: SyncDataType.setting, data: data.setting.val, data_version: SAVE_SETTING_KEY.version, updated_at },
      {
        type: SyncDataType.practice_word,
        //@ts-ignore
        data: data?.[PRACTICE_WORD_CACHE.key]?.val ?? null,
        data_version: PRACTICE_WORD_CACHE.version,
        updated_at,
      },
      {
        type: SyncDataType.practice_article,
        //@ts-ignore
        data: data?.[PRACTICE_ARTICLE_CACHE.key]?.val ?? null,
        data_version: PRACTICE_ARTICLE_CACHE.version,
        updated_at,
      },
    ]
    try {
      await sb.upsert(rows)
      await replaceRemoteWithLocal(sb)
      return true
    } catch (error) {
      Cloud.setStatus('error', (error as Error)?.message ?? String(error))
      return false
    }
  }

  /** 首次同步选“以云端为准”：整份拉取覆盖本地 */
  async function pullAllRemoteToLocal(client?: CloudClient | null): Promise<boolean> {
    const sb = getSyncClient(client)
    if (!sb) return false
    try {
      const rows = (await sb.getTypes(ALL_SYNC_TYPES)) as RemoteDataRow[]
      const map = new Map(rows.map(item => [item.type, item]))
      for (const type of ALL_SYNC_TYPES) {
        if (type === SyncDataType.dict) continue
        await applyRemoteDataByType(type, map.get(type) ?? null, store, settingStore)
      }
      // 词典数据：云端有按条存的就整份拉下来；只有旧版整块数据时按旧格式导入，再以新格式传上去
      if (!(await replaceLocalWithRemote(sb as CloudClient))) {
        const legacy = map.get(SyncDataType.dict)
        if (legacy) {
          await applyRemoteDataByType(SyncDataType.dict, legacy, store, settingStore)
          await replaceRemoteWithLocal(sb as CloudClient)
        }
      }
      Cloud.setStatus('success')
      return true
    } catch (error) {
      Cloud.setStatus('error', error?.message ?? String(error))
      return false
    }
  }

  /** 立即保存学习数据（只写变了的记录），开了同步就尽快上传 */
  async function saveDictState(_state?: BaseState, _options?: SaveLocalAndSyncOptions) {
    try {
      await flushSave()
    } catch (e) {
      console.error('[persist] 保存失败', e)
    }
    schedulePush(0)
    void requestPersistentStorage()
  }

  async function getLocalCompactDataByType(type: SyncDataType) {
    if (type === SyncDataType.practice_word) return await getPracticeWordCacheLocal()
    if (type === SyncDataType.practice_article) return await getPracticeArticleCacheLocal()
    if (type === SyncDataType.dict) return shakeCommonDict(store.$state)
    if (type === SyncDataType.setting) return settingStore.$state
  }

  async function clear() {
    let d = getDefaultBaseState()
    d.load = true
    let d1 = getDefaultSettingState()
    d1.load = true
    let data: any = {
      dict: { val: d },
      setting: { val: d1 },
      [PRACTICE_WORD_CACHE.key]: null,
      [PRACTICE_ARTICLE_CACHE.key]: null,
      // @deprecated 大版本5废弃
      [APP_VERSION.key]: null,
    }
    store.setState(d)
    settingStore.setState(d1)
    await set(PARKED_PRACTICE_KEY, [])
    localStorage.removeItem(PRACTICE_FLOW_STORAGE_KEY)
    return await forcePushLocalDataToRemote(data)
  }

  return {
    pullIfRemoteNewer,
    saveLocalAndSync,
    getRemoteData,
    getRemoteMeta,
    saveDictState,
    forcePushLocalDataToRemote,
    pullAllRemoteToLocal,
    getLocalCompactDataByType,
    syncData,
    getDictSyncBlockReason,
    clear,
  }
}
