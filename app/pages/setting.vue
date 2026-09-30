<script setup lang="ts">
import { defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSettingStore } from '@/core/stores/setting'
import { getShortcutKey, useEventListener } from '@/core/hooks/event'
import { checkAndUpgradeSaveDict, checkAndUpgradeSaveSetting, cloneDeep, isEmpty, loadJsLib } from '@/core/utils'
import { BaseButton, BaseInput, BasePage, Form, FormItem, type FormType, PopConfirm, Toast, UploadButton } from '@/base'
import { useBaseStore } from '@/core/stores/base'
import {
  APP_NAME,
  APP_VERSION,
  BACKUP_INDEX_KEY,
  DefaultShortcutKeyMap,
  DictId,
  LIB_JS_URL,
  LOCAL_FILE_KEY,
  PARKED_PRACTICE_KEY,
  PRACTICE_FLOW_STORAGE_KEY,
} from '@/core/config/env'
import { get, set } from 'idb-keyval'
import { useRuntimeStore } from '@/core/stores/runtime'
import { useExport } from '@/core/hooks/export'
import Log from '@/components/setting/Log.vue'
import About from '@/components/About.vue'
import CommonSetting from '@/components/setting/CommonSetting.vue'
import FsrsSetting from '@/components/setting/FsrsSetting.vue'
import ArticleSetting from '@/components/setting/ArticleSetting.vue'
import WordSetting from '@/components/setting/WordSetting.vue'
import SoundSetting from '@/components/setting/SoundSetting.vue'
import { checkAndUpgradePracticeWordCache, PRACTICE_ARTICLE_CACHE, PRACTICE_WORD_CACHE } from '@/core/utils/cache'
import { useDataSyncPersistence } from '@/core/composables/useDataSyncPersistence'
import SettingItem from '@/components/setting/SettingItem.vue'
import { Cloud } from '@/core/utils/cloud'
import CloudSyncPanel from '@/components/setting/CloudSyncPanel.vue'
import BackupGateDialog from '@/components/dialog/BackupGateDialog.vue'

import { useRoute } from 'vue-router'
import type { BackupData, Snapshot } from '@/core'
import { replayIcon } from '@/base/icon/motion.ts'

const Dialog = defineAsyncComponent(() => import('@/base/dialog/Dialog.vue'))

type HistoryBackupIndexItem = {
  hash: string
  key: string
  createdAt: number
}

type HistoryBackupMeta = HistoryBackupIndexItem & {
  previousHash?: string | null
}

let route = useRoute()
const { t } = useI18n()
let title = APP_NAME + t('setting_page_title_suffix')
useSeoMeta({
  title: title,
  description: title,
  ogTitle: title,
  ogDescription: title,
  ogUrl: useRequestURL().href,
  twitterTitle: title,
  twitterDescription: title,
})

const tabIndex = $ref(Number(route?.query?.index ?? 0))
const settingStore = useSettingStore()
const runtimeStore = useRuntimeStore()
const store = useBaseStore()
const dataSyncPersistence = useDataSyncPersistence()

const config = useRuntimeConfig()
const gitLastCommitHash = ref(config?.public?.latestCommitHash)
const gitLastCommitTime = ref(config?.public?.latestCommitTime)

let editShortcutKey = $ref('')

const disabledDefaultKeyboardEvent = $computed(() => {
  return editShortcutKey && tabIndex === 7
})

// 监听编辑快捷键状态变化，自动聚焦输入框
watch(
  () => editShortcutKey,
  newVal => {
    if (newVal) {
      // 使用nextTick确保DOM已更新
      nextTick(() => {
        focusShortcutInput()
      })
    }
  }
)

useEventListener('keydown', (e: KeyboardEvent) => {
  if (!disabledDefaultKeyboardEvent) return

  // 确保阻止浏览器默认行为
  e.preventDefault()
  e.stopPropagation()

  let shortcutKey = getShortcutKey(e)

  // console.log('e', e, e.keyCode, e.ctrlKey, e.altKey, e.shiftKey)
  // console.log('key', shortcutKey)

  // if (shortcutKey[shortcutKey.length-1] === '+') {
  //   settingStore.shortcutKeyMap[editShortcutKey] = DefaultShortcutKeyMap[editShortcutKey]
  //   return ElMessage.warning('设备失败！')
  // }

  if (editShortcutKey) {
    if (shortcutKey === 'Delete') {
      settingStore.shortcutKeyMap[editShortcutKey] = ''
    } else {
      // 忽略单独的修饰键
      if (
        shortcutKey === 'Ctrl+' ||
        shortcutKey === 'Alt+' ||
        shortcutKey === 'Shift+' ||
        e.key === 'Control' ||
        e.key === 'Alt' ||
        e.key === 'Shift'
      ) {
        return
      }

      for (const [k, v] of Object.entries(settingStore.shortcutKeyMap)) {
        if (v === shortcutKey && k !== editShortcutKey) {
          settingStore.shortcutKeyMap[editShortcutKey] = DefaultShortcutKeyMap[editShortcutKey]
          return Toast.warning(t('shortcut_key_duplicate'))
        }
      }
      settingStore.shortcutKeyMap[editShortcutKey] = shortcutKey
    }
  }
})

function handleInputBlur() {
  // 输入框失焦时结束编辑状态
  editShortcutKey = ''
}

function focusShortcutInput() {
  // 找到当前正在编辑的快捷键输入框
  const inputElements = document.querySelectorAll('.set-key input')
  if (inputElements && inputElements.length > 0) {
    // 聚焦第一个找到的输入框
    const inputElement = inputElements[0] as HTMLInputElement
    inputElement.focus()
  }
}

// 快捷键中文名称映射
function getShortcutKeyName(key: string): string {
  const shortcutKeyNameMap: Record<string, string> = {
    ShowWord: t('shortcut_show_word'),
    EditArticle: t('shortcut_edit_article'),
    Next: t('shortcut_next'),
    Previous: t('shortcut_previous'),
    Ignore: t('shortcut_ignore'),
    ToggleSimple: t('shortcut_toggle_simple'),
    ToggleCollect: t('shortcut_toggle_collect'),
    CollectToDict: t('collect_to_dict'),
    NextChapter: t('shortcut_next_chapter'),
    PreviousChapter: t('shortcut_previous_chapter'),
    NextStep: t('shortcut_next_step'),
    RepeatChapter: t('shortcut_repeat_chapter'),
    DictationChapter: t('shortcut_dictation_chapter'),
    PlayWordPronunciation: t('shortcut_play_word_pronunciation'),
    ToggleShowTranslate: t('shortcut_toggle_show_translate'),
    ToggleDictation: t('shortcut_toggle_dictation'),
    ToggleTheme: t('shortcut_toggle_theme'),
    ToggleConciseMode: t('shortcut_toggle_concise_mode'),
    ToggleToolbar: t('shortcut_toggle_toolbar'),
    TogglePanel: t('shortcut_toggle_panel'),
    RandomWrite: t('shortcut_random_write'),
    KnowWord: t('shortcut_know_word'),
    UnknownWord: t('shortcut_unknown_word'),
    MasteredWord: t('shortcut_mastered_word'),
    ChooseA: t('shortcut_choose_a'),
    ChooseB: t('shortcut_choose_b'),
    ChooseC: t('shortcut_choose_c'),
    ChooseD: t('shortcut_choose_d'),
    SelfTestingChooseA: t('shortcut_self_testing_choose_a'),
    SelfTestingChooseB: t('shortcut_self_testing_choose_b'),
    SelfTestingChooseC: t('shortcut_self_testing_choose_c'),
    SelfTestingChooseD: t('shortcut_self_testing_choose_d'),
    PlaySentence1: t('shortcut_play_sentence_1'),
    PlaySentence2: t('shortcut_play_sentence_2'),
    PlaySentence3: t('shortcut_play_sentence_3'),
    PlaySentence4: t('shortcut_play_sentence_4'),
    PlaySentence5: t('shortcut_play_sentence_5'),
    PlaySentence6: t('shortcut_play_sentence_6'),
    PlaySentence7: t('shortcut_play_sentence_7'),
    PlaySentence8: t('shortcut_play_sentence_8'),
    PlaySentence9: t('shortcut_play_sentence_9'),
  }

  return shortcutKeyNameMap[key] || key
}

function resetShortcutKeyMap() {
  editShortcutKey = ''
  settingStore.shortcutKeyMap = cloneDeep(DefaultShortcutKeyMap)
  Toast.success(t('restore_success'))
}

let importLoading = $ref(false)

const { loading: exportLoading, exportData, getExportedData } = useExport()

function upgradeImportedPracticeWordCache(data: BackupData['val']) {
  data[PRACTICE_WORD_CACHE.key] = checkAndUpgradePracticeWordCache(data[PRACTICE_WORD_CACHE.key], data.setting.val)
}

async function importJson(str: string) {
  importLoading = true
  let obj: BackupData = {
    version: -1,
    val: {
      setting: {},
      dict: {},
      [PRACTICE_WORD_CACHE.key]: null,
      [PRACTICE_ARTICLE_CACHE.key]: null,
      // @deprecated 大版本5废弃
      [APP_VERSION.key]: null,
    },
  }
  try {
    debugger
    obj = JSON.parse(str)
    let data = obj.val
    data.dict.val = await checkAndUpgradeSaveDict(data.dict)
    data.setting.val = await checkAndUpgradeSaveSetting(data.setting)
    upgradeImportedPracticeWordCache(data)
    //老版本兼容逻辑
    if (obj.version === 4) {
      if (!isEmpty(data?.[APP_VERSION.key])) {
        data.setting.val.webAppVersion = data?.[APP_VERSION.key]
      }
    }
    //需在调同步方法前面，同步方法可能报错
    let hasRemote = Cloud.check()
    runtimeStore.globalLoading = true
    const pushOk = await dataSyncPersistence.forcePushLocalDataToRemote(data)
    runtimeStore.globalLoading = false
    if (pushOk) {
      Toast.success(t('import_success_overwrite_remote'))
    } else {
      Toast.success(hasRemote ? t('import_success_push_failed') : t('import_success'))
    }
    runtimeStore.isNew = APP_VERSION.version > Number(data.setting?.val?.webAppVersion ?? APP_VERSION.version)
    data.setting.val.load = true
    settingStore.setState(data.setting.val)
    data.dict.val.load = true
    store.setState(data.dict.val)
    await restoreLocalExtras(data)
    showBackupGate = false
  } catch (err) {
    return Toast.error(t('import_failed'))
  } finally {
    importLoading = false
  }
}

/** 备份里的本机数据：自定义练习流程、各词典没练完的一组（旧版备份没有，跳过即可） */
async function restoreLocalExtras(data: BackupData['val']) {
  try {
    if (data.practiceFlow) localStorage.setItem(PRACTICE_FLOW_STORAGE_KEY, JSON.stringify(data.practiceFlow))
    if (Array.isArray(data.parkedPracticeWord)) await set(PARKED_PRACTICE_KEY, data.parkedPracticeWord)
  } catch (e) {
    console.warn('恢复练习流程 / 暂存进度失败', e)
  }
}

async function importData(e) {
  importLoading = true
  let file = e.target.files[0]
  if (!file) return (importLoading = false)
  if (file.name.endsWith('.json')) {
    let reader = new FileReader()
    reader.onload = function (v) {
      let str: any = v.target.result
      if (str) {
        importJson(str)
      }
    }
    reader.readAsText(file)
  } else if (file.name.endsWith('.zip')) {
    try {
      const JSZip = await loadJsLib('JSZip', LIB_JS_URL.JSZIP)
      const zip = await JSZip.loadAsync(file)

      const dataFile = zip.file('data.json')
      if (!dataFile) {
        return Toast.error(t('missing_data_json'))
      }

      const mp3Folder = zip.folder('mp3')
      if (mp3Folder) {
        const records: { id: string; file: Blob }[] = []
        for (const filename in zip.files) {
          if (filename.startsWith('mp3/') && filename.endsWith('.mp3')) {
            const entry = zip.file(filename)
            if (!entry) continue
            const blob = await entry.async('blob')
            const id = filename.replace(/^mp3\//, '').replace(/\.mp3$/, '')
            records.push({ id, file: blob })
          }
        }
        await set(LOCAL_FILE_KEY, records)
      }

      const str = await dataFile.async('string')
      await importJson(str)
    } catch (e) {
      Toast.error(e?.message || e || t('import_failed'))
    } finally {
      importLoading = false
    }
  } else {
    Toast.error(t('unsupported_file_type'))
  }
  importLoading = false
}

let showBackupGate = $ref(false)
let showHistoryDialog = $ref(false)
let pendingNextAction = $ref<'import' | 'restore_history' | ''>('')
let historyBackups = $ref<HistoryBackupMeta[]>([])
let restoreTarget = $ref<HistoryBackupMeta | null>(null)
let restoreLoading = $ref(false)

function openGate(type) {
  pendingNextAction = type
  showBackupGate = true
}

async function openHistoryDialog() {
  const raw = (await get(BACKUP_INDEX_KEY)) as HistoryBackupIndexItem[] | undefined
  const index = Array.isArray(raw)
    ? raw.filter(item => item && typeof item.hash === 'string' && typeof item.key === 'string')
    : []
  const items: HistoryBackupMeta[] = []
  for (const item of index) {
    const snapshot = (await get(item.key)) as { meta?: { previousHash?: string | null } } | undefined
    items.push({
      ...item,
      previousHash: snapshot?.meta?.previousHash ?? null,
    })
  }
  historyBackups = items.sort((a, b) => b.createdAt - a.createdAt)
  showHistoryDialog = true
}

function formatHistoryTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function openHistoryRestoreGate(item: HistoryBackupMeta) {
  restoreTarget = item
  openGate('restore_history')
}

async function restoreHistoryData() {
  if (!restoreTarget) return
  if (restoreLoading) return
  restoreLoading = true
  try {
    const { data: val }: Snapshot = await get(restoreTarget.key)
    debugger
    let data: BackupData['val'] = {
      setting: JSON.parse(val.setting),
      dict: JSON.parse(val.dict),
      [PRACTICE_WORD_CACHE.key]: JSON.parse(val[PRACTICE_WORD_CACHE.key]),
      [PRACTICE_ARTICLE_CACHE.key]: JSON.parse(val[PRACTICE_ARTICLE_CACHE.key]),
    }
    data.dict.val = await checkAndUpgradeSaveDict(data.dict)
    data.setting.val = await checkAndUpgradeSaveSetting(data.setting)
    upgradeImportedPracticeWordCache(data)

    //需在调同步方法前面，同步方法可能报错
    let hasRemote = Cloud.check()
    runtimeStore.globalLoading = true
    const pushOk = await dataSyncPersistence.forcePushLocalDataToRemote(data)
    runtimeStore.globalLoading = false
    if (pushOk) {
      Toast.success(t('history_restore_success_overwrite_remote'))
    } else {
      Toast.success(hasRemote ? t('history_restore_success_push_failed') : t('restore_success_short'))
    }
    runtimeStore.isNew = APP_VERSION.version > Number(data.setting?.val?.webAppVersion ?? APP_VERSION.version)
    data.setting.val.load = true
    settingStore.setState(data.setting.val)
    data.dict.val.load = true
    store.setState(data.dict.val)
    showBackupGate = false
    showHistoryDialog = false
  } catch (error) {
    Toast.error(t('restore_failed') + ((error as Error)?.message ?? String(error)))
  } finally {
    restoreLoading = false
  }
}

async function clearAllData() {
  const ok = await dataSyncPersistence.clear()
  if (!ok && Cloud.check()) Toast.warning(t('cloud_clear_pending'))
  else Toast.success(t('clear_success'))
}

// ── 选中底色在标签之间滑动（与侧栏一致），首次定位不滑动 ──
// 桌面是竖排标签，手机是横向滚动的一排：底色按选中标签的位置和大小走，两种排法都适用
let tabsRef = $ref<HTMLElement | null>(null)
let tabIndicatorX = $ref(0)
let tabIndicatorY = $ref(0)
let tabIndicatorW = $ref(0)
let tabIndicatorH = $ref(0)
let tabIndicatorReady = $ref(false)

function placeTabIndicator() {
  const active = tabsRef?.querySelector('.tab.active') as HTMLElement | null
  if (!active) return
  tabIndicatorX = active.offsetLeft
  tabIndicatorY = active.offsetTop
  tabIndicatorW = active.offsetWidth
  tabIndicatorH = active.offsetHeight
  // 手机上标签横向滚动：选中的标签露出来
  if (tabsRef && tabsRef.scrollWidth > tabsRef.clientWidth) {
    active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: tabIndicatorReady ? 'smooth' : 'auto' })
  }
  if (!tabIndicatorReady) requestAnimationFrame(() => requestAnimationFrame(() => (tabIndicatorReady = true)))
}

watch(
  () => tabIndex,
  () => nextTick(placeTabIndicator)
)

onMounted(() => {
  nextTick(placeTabIndicator)
  window.addEventListener('resize', placeTabIndicator)
})
onBeforeUnmount(() => window.removeEventListener('resize', placeTabIndicator))

function onTabsClick(e: MouseEvent) {
  replayIcon((e.target as HTMLElement).closest('.tab'))
}

function disable360() {
  let disabled = localStorage.getItem('disable360')
  if (disabled) {
    localStorage.removeItem('disable360')
    Toast.success('已清除')
  } else {
    localStorage.setItem('disable360', '1')
    Toast.success('已设置')
  }
}
</script>

<template>
  <BasePage>
    <div class="setting text-md card flex flex-col tile-enter">
      <div class="page-title text-align-center">{{ $t('setting') }}</div>
      <div class="setting-body flex flex-1 overflow-hidden gap-4">
        <div class="left">
          <div class="tabs" ref="tabsRef" @click="onTabsClick">
            <div
              class="tab-indicator"
              :class="{ 'is-ready': tabIndicatorReady }"
              :style="{
                width: tabIndicatorW + 'px',
                height: tabIndicatorH + 'px',
                transform: `translate3d(${tabIndicatorX}px, ${tabIndicatorY}px, 0)`,
              }"
              aria-hidden="true"
            ></div>
            <div class="tab" :class="tabIndex === 0 && 'active'" @click="tabIndex = 0">
              <IconLineMdCog />
              <span>{{ $t('general_settings') }}</span>
            </div>
            <div class="tab" :class="tabIndex === 1 && 'active'" @click="tabIndex = 1">
              <IconLucideBrainCircuit />
              <span>{{ $t('fsrs_settings') }}</span>
            </div>
            <div class="tab" :class="tabIndex === 2 && 'active'" @click="tabIndex = 2">
              <IconLineMdTextBox />
              <span>{{ $t('word_settings') }}</span>
            </div>
            <div class="tab" :class="tabIndex === 3 && 'active'" @click="tabIndex = 3">
              <IconLineMdDocumentList />
              <span>{{ $t('article_settings') }}</span>
            </div>
            <div class="tab" :class="tabIndex === 4 && 'active'" @click="tabIndex = 4">
              <IconLineMdVolumeHigh />
              <span>{{ $t('sound_settings') }}</span>
            </div>
            <div class="tab" :class="tabIndex === 5 && 'active'" @click="tabIndex = 5">
              <IconLucideDatabase />
              <span>{{ $t('data_management') }}</span>
            </div>

            <div class="tab" :class="tabIndex === 6 && 'active'" @click="tabIndex = 6">
              <IconLucideCloudUpload />
              <span>{{ $t('data_sync') }}</span>
              <div class="red-point" v-if="runtimeStore.isError"></div>
            </div>
            <div class="tab" :class="tabIndex === 7 && 'active'" @click="tabIndex = 7">
              <IconLucideKeyboard />
              <span>{{ $t('shortcut_settings') }}</span>
            </div>
            <div class="tab" :class="tabIndex === 8 && 'active'" @click="tabIndex = 8">
              <IconLineMdClipboardList />
              <span>{{ $t('update_log') }}</span>
              <!--              <div class="red-point" v-if="runtimeStore.isNew"></div>-->
            </div>
            <div class="tab" :class="tabIndex === 9 && 'active'" @click="tabIndex = 9">
              <IconLineMdAccount />
              <span>{{ $t('about') }}</span>
            </div>
          </div>
        </div>
        <div class="col-line"></div>
        <div class="flex-1 overflow-y-auto overflow-x-hidden pr-4 content swap-in" :key="tabIndex">
          <CommonSetting v-if="tabIndex === 0" />
          <FsrsSetting v-if="tabIndex === 1" />
          <WordSetting v-if="tabIndex === 2" />
          <ArticleSetting v-if="tabIndex === 3" />
          <SoundSetting v-if="tabIndex === 4" />

          <div v-if="tabIndex === 5">
            <!--            导出数据-->
            <SettingItem
              :title="$t('export_data_title')"
              :desc="$t('cloud_storage_desc') + $t('export_data_desc_suffix', { appName: APP_NAME })"
            >
              <BaseButton size="large" :loading="exportLoading" @click="exportData()">{{
                $t('export_data_backup')
              }}</BaseButton>
            </SettingItem>
            <div class="text-gray text-sm">💾 {{ $t('export_zip_hint') }}</div>
            <div class="line my-3"></div>

            <!--            导入数据-->
            <SettingItem :title="$t('import_data_title')">
              <BaseButton size="large" @click="openGate('import')" :loading="importLoading">{{
                $t('import_data_restore')
              }}</BaseButton>
            </SettingItem>
            <i18n-t keypath="import_overwrite_warning" tag="span">
              <strong class="color-red">{{ $t('complete_overflow') }}</strong>
            </i18n-t>

            <div class="line my-3"></div>
            <SettingItem :title="$t('other')"> </SettingItem>
            <div class="flex gap-space">
              <BaseButton size="large" @click="openHistoryDialog">{{ $t('history_data') }}</BaseButton>
              <PopConfirm :title="$t('cloud_clear_confirm')" @confirm="clearAllData">
                <BaseButton size="large">{{ $t('clear_all_data') }}</BaseButton>
              </PopConfirm>
              <PopConfirm
                title="不要乱点，点击后会使导出功能失效，仅适用于： Mac 版本 360 极速浏览器"
                @confirm="disable360"
              >
                <BaseButton size="large" type="info">跳过导出</BaseButton>
              </PopConfirm>
            </div>
          </div>

          <CloudSyncPanel v-if="tabIndex === 6" />

          <div class="body" v-if="tabIndex === 7">
            <div class="row">
              <label class="main-title">{{ $t('function') }}</label>
              <div class="wrapper">{{ $t('shortcut_key') }}</div>
            </div>
            <div class="scroll">
              <div class="row" v-for="item of Object.entries(settingStore.shortcutKeyMap)">
                <label class="item-title">{{ getShortcutKeyName(item[0]) }}</label>
                <div class="wrapper" @click="editShortcutKey = item[0]">
                  <div class="set-key" v-if="editShortcutKey === item[0]">
                    <input
                      ref="shortcutInput"
                      :value="item[1] ? item[1] : $t('no_shortcut_set')"
                      readonly
                      type="text"
                      @blur="handleInputBlur"
                    />
                    <span @click.stop="editShortcutKey = ''"
                      >{{ $t('press_key_to_set') }}，<span class="text-red!">{{
                        $t('click_here_when_done')
                      }}</span></span
                    >
                  </div>
                  <div v-else>
                    <div v-if="item[1]">{{ item[1] }}</div>
                    <span v-else>{{ $t('no_shortcut_set') }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="row">
              <label class="item-title"></label>
              <div class="wrapper">
                <BaseButton size="large" @click="resetShortcutKeyMap">{{ $t('restore_default') }}</BaseButton>
              </div>
            </div>
          </div>

          <!--          日志-->
          <Log v-if="tabIndex === 8" />

          <div v-if="tabIndex === 9" class="center flex-col">
            <About />
            <div class="text-md color-gray mt-10">Build {{ gitLastCommitHash }} {{ gitLastCommitTime }}</div>
          </div>
        </div>
      </div>
    </div>
  </BasePage>

  <BackupGateDialog v-model="showBackupGate">
    <template v-slot="{ disabled }">
      <BaseButton
        size="large"
        v-if="pendingNextAction === 'restore_history'"
        @click="restoreHistoryData"
        :disabled="disabled"
        :loading="restoreLoading"
      >
        {{ $t('restore_history_data') }}
      </BaseButton>

      <UploadButton
        @change="importData"
        :disabled="disabled"
        :loading="importLoading"
        accept="application/json,.zip,application/zip"
        v-else
      >
        {{ $t('import_data_restore') }}
      </UploadButton>
    </template>
  </BackupGateDialog>

  <Dialog v-model="showHistoryDialog" :title="$t('history_data_dialog_title')">
    <div class="p-4 w-120 max-h-100 overflow-auto">
      <div v-if="!historyBackups.length" class="color-gray">{{ $t('no_history_data') }}</div>
      <div v-else class="flex flex-col gap-3">
        <div>{{ $t('history_data_desc', { appName: APP_NAME }) }}</div>
        <div v-for="(item, i) in historyBackups" :key="item.key" class="border rounded-md flex justify-between">
          <div>
            <div class="">{{ i + 1 }}{{ $t('index_version_label') }}{{ item.hash }}</div>
            <div class="color-gray">{{ $t('auto_backup_time') }}{{ formatHistoryTime(item.createdAt) }}</div>
          </div>
          <div class="mt-2">
            <BaseButton size="large" @click="openHistoryRestoreGate(item)" :disabled="restoreLoading">{{
              $t('restore_this_version')
            }}</BaseButton>
          </div>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.col-line {
  border-right: 1px solid var(--color-line);
}

.setting {
  .left {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;

    .tabs {
      position: relative;
      padding: 0.6rem 0;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;

      .tab-indicator {
        position: absolute;
        top: 0;
        left: 0;
        border-radius: 0.75rem;
        background: var(--color-brand-soft);
        pointer-events: none;

        &.is-ready {
          transition: transform 260ms var(--ease-in-out);
        }

        @media (prefers-reduced-motion: reduce) {
          &.is-ready {
            transition-duration: 0.01ms;
          }
        }
      }

      .tab {
        @apply cursor-pointer flex items-center relative;
        border-radius: 0.75rem;
        @apply w-auto p-1 lg:w-40 lg:p-2;
        gap: 0.6rem;
        color: var(--color-main-text);
        transition:
          background-color var(--dur-hover) ease,
          color var(--dur-hover) ease,
          transform 160ms var(--ease-out);

        svg {
          @apply text-lg shrink-0;
        }

        &:hover {
          background: var(--color-tile-sunken);
        }

        &:active {
          transform: scale(0.97);
        }

        &.active {
          color: var(--color-brand-text);
          font-weight: 600;

          &:hover {
            background: transparent;
          }
        }
      }
    }
  }

  .content {
    .row {
      min-height: 2.6rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: calc(var(--space) * 5);

      .wrapper {
        height: 2rem;
        flex: 1;
        display: flex;
        justify-content: flex-end;
        gap: var(--space);

        span {
          text-align: right;
          color: gray;
        }

        .set-key {
          align-items: center;

          input {
            width: 9rem;
            box-sizing: border-box;
            margin-right: 0.6rem;
            height: 1.8rem;
            outline: none;
            font-size: 1rem;
            border: 1px solid gray;
            border-radius: 0.2rem;
            padding: 0 0.3rem;
            background: var(--color-second);
            color: var(--color-font-1);
          }
        }
      }

      .main-title {
        font-size: 1.1rem;
        font-weight: bold;
      }

      .item-title {
        font-size: 1rem;
      }

      .sub-title {
        font-size: 0.9rem;
      }
    }

    .body {
      height: 100%;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .scroll {
      flex: 1;
      padding-right: 0.6rem;
      overflow: auto;
    }

    .line {
      border-bottom: 1px solid var(--color-line);
    }
  }
}

/* 桌面：卡片占满一屏，左边竖排标签、右边内容各自滚动 */
@media (min-width: 769px) {
  .setting {
    height: calc(100vh - 6rem);
  }
}

/* 手机：标签变成顶部一排可横向滑动的胶囊，内容占满整宽，跟着页面自然滚动 */
@media (max-width: 768px) {
  .setting {
    padding: 1rem 1rem 1.25rem;

    .page-title {
      font-size: 1.35rem;
    }
  }

  .setting-body {
    flex-direction: column;
    gap: 0.75rem;
    overflow: visible;
  }

  .col-line {
    display: none;
  }

  .setting .left {
    display: block;
    margin: 0 -1rem;

    .tabs {
      flex-direction: row;
      gap: 0.35rem;
      padding: 0.35rem 1rem;
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;

      &::-webkit-scrollbar {
        display: none;
      }

      .tab {
        flex-shrink: 0;
        width: auto;
        min-height: 2.5rem;
        padding: 0 0.85rem;
        gap: 0.4rem;
        white-space: nowrap;
        font-size: 0.9rem;
        border-radius: 999px;

        svg {
          font-size: 1rem;
        }
      }

      .tab-indicator {
        border-radius: 999px;
      }
    }
  }

  .setting .content {
    overflow: visible !important;
    padding-right: 0 !important;

    .row {
      gap: 0.75rem;
    }

    .body {
      height: auto;
    }

    .scroll {
      padding-right: 0;
    }
  }
}
</style>
