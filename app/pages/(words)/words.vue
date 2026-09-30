<script setup lang="ts">
import { useBaseStore } from '@/core/stores/base.ts'
import { useRoute, useRouter } from 'vue-router'
import {
  BaseButton,
  BaseIcon,
  BasePage,
  Calendar,
  DeleteIcon,
  Dialog,
  OptionButton,
  PopConfirm,
  Progress,
  RollNumber,
  Switch,
  Toast,
  Tooltip,
} from '@/base'
import {
  _getAccomplishDate,
  _getDictDataByUrl,
  _nextTick,
  debounce,
  getShufflePracticeWords,
  isMobile,
  isSameDictResource,
  loadJsLib,
  msToHourMinute,
  resourceWrap,
  type ShufflePracticeSetting,
  total,
  useNav,
} from '@/core/utils'
import type { Dict, DictResource, Statistics } from '@/core/types/types.ts'
import { onMounted, onUnmounted, watch } from 'vue'
import { useRuntimeStore } from '@/core/stores/runtime.ts'
import Book from '@/components/Book.vue'
import { getDefaultDict } from '@/core/types/func.ts'
import PracticeSettingDialog from '@/components/word/PracticeSettingDialog.vue'
import ChangeLastPracticeIndexDialog from '@/components/word/ChangeLastPracticeIndexDialog.vue'
import { useSettingStore } from '@/core/stores/setting.ts'
import { useFetch } from '@vueuse/core'
import {
  APP_NAME,
  DICT_LIST,
  LIB_JS_URL,
  TourConfig,
  WordPracticeModeNameMap,
  WordPracticeModeUrlMap,
} from '@/core/config/env.ts'
import PracticeWordListDialog from '@/components/word/PracticeWordListDialog.vue'
import ActivityHeatmap from '@/components/word/ActivityHeatmap.vue'
import MyDictPicker from '@/components/word/MyDictPicker.vue'
import { buildDailyActivity } from '@/core/utils/activity.ts'
import ShufflePracticeSettingDialog from '@/components/word/ShufflePracticeSettingDialog.vue'
import { flushStatToStore } from '@/core/composables/usePracticePersistence'
import { useDataSyncPersistence } from '@/core/composables/useDataSyncPersistence'
import { WordPracticeMode } from '@/core/types/enum.ts'
import {
  type PracticeWordCache,
  UnsupportedPracticeCacheVersionError,
  usePracticeWordPersistence,
} from '@/core/composables/practice-words/practice-word-session.ts'
import dayjs from 'dayjs'
import { getActiveCustomFlowId, getUserFlow } from '@/core/composables/practice-words/practice-flow-runtime.ts'
import { createStudyTask } from '@/core/composables/practice-words/study-task.ts'
import { switchStudyDict, withSavedProgress } from '@/core/composables/practice-words/dict-switch.ts'

const store = useBaseStore()
const settingStore = useSettingStore()
const wordPersistence = usePracticeWordPersistence()
const dataSync = useDataSyncPersistence()
const router = useRouter()
const route = useRoute()
const { nav } = useNav()
const runtimeStore = useRuntimeStore()
// 按钮上的加载状态只在确实慢（超过 300ms）时才出现：进页面、换词书通常几十毫秒就好，不再闪一下
let loading = $ref(false)
let busyCount = 0
let busyTimer: ReturnType<typeof setTimeout> | null = null
let busyWaiters: Array<() => void> = []
function busyStart() {
  if (busyCount++ === 0) busyTimer = setTimeout(() => (loading = true), 300)
}
function busyEnd() {
  if (--busyCount > 0) return
  busyCount = 0
  if (busyTimer) clearTimeout(busyTimer)
  busyTimer = null
  loading = false
  busyWaiters.splice(0).forEach(resolve => resolve())
}
/** 进页面 / 换词书还没准备好时，点开始学习先等它准备好 */
function whenReady(): Promise<void> {
  return busyCount ? new Promise(resolve => busyWaiters.push(resolve)) : Promise.resolve()
}
// 首次数据准备完成前算作“忙”
busyStart()
let firstInitDone = false
let isSaveData = $ref(false)
/** 新手引导进行中（从第 4 步点开始学习） */
let guiding = false
let unsupportedCacheVersion = false

async function loadPracticeCache() {
  try {
    return await wordPersistence.load()
  } catch (error) {
    if (!(error instanceof UnsupportedPracticeCacheVersionError)) throw error
    unsupportedCacheVersion = true
    Toast.error('练习缓存来自更高版本，请升级后再继续')
    return null
  }
}

const shouldShowDialogPracticeMode = [WordPracticeMode.Shuffle, WordPracticeMode.ShuffleWordsTest]

useSeoMeta({
  title: `在线背单词与英语打字练习｜${APP_NAME}`,
  description: '在电脑上选择 CET-4、CET-6、考研、GRE、IELTS 等词库，通过键盘跟打、拼写和科学间隔复习高效背单词。',
  ogTitle: `在线背单词与英语打字练习｜${APP_NAME}`,
  ogDescription: '在电脑上用键盘打字背单词，支持 50+ 词库和科学间隔复习。',
  twitterTitle: `在线背单词与英语打字练习｜${APP_NAME}`,
  twitterDescription: '在电脑上用键盘打字背单词，支持 50+ 词库和科学间隔复习。',
})

let practiceData = $ref<PracticeWordCache>({
  taskWords: {
    new: [],
    review: [],
  },
} as any)
let dueReviewCount = $ref(0)

function refreshStudyTask() {
  const result = createStudyTask()
  practiceData.taskWords = result.taskWords
  dueReviewCount = result.dueReviewCount
  return result
}

function toggleAutoAddRandomReview(enabled: boolean) {
  settingStore.autoAddRandomReviewWhenNoDue = enabled
  const result = refreshStudyTask()
  if (!enabled) return
  if (result.randomReviewCount > 0) {
    Toast.success(`已将 ${result.randomReviewCount} 个随机复习词加入本次学习`)
  } else {
    Toast.warning('暂无单词可以复习，先学习一些新词后再来看看吧')
  }
}

const effectiveReviewRatio = $computed(() => {
  const dict = store.sdict
  const isEnd = dict.length !== 1 && dict.lastLearnIndex >= dict.length - 1
  return isEnd ? settingStore.wordReviewRatio || 1 : settingStore.wordReviewRatio
})

const reviewWordLimit = $computed(() => {
  return Math.max(0, Math.floor(store.sdict.perDayStudyNumber * effectiveReviewRatio))
})

const reviewWordTip = $computed(() => {
  const dailyGoal = store.sdict.perDayStudyNumber
  const actualCount = practiceData?.taskWords?.review?.length ?? 0
  const rule = `复习词来自记忆曲线中今天及以前到期的已学单词，并会排除本组新词、已掌握词和已忽略词。“${effectiveReviewRatio} 倍”只决定数量上限：每日新词目标 ${dailyGoal} × ${effectiveReviewRatio}，本组最多安排 ${reviewWordLimit} 个。\n`

  if (isSaveData) {
    return `${rule}当前是已生成的未完成任务，共安排 ${actualCount} 个复习词；\n实际数量取决于任务生成时符合条件的到期词，不会用未到期词补足。`
  }
  if (reviewWordLimit === 0) {
    return `${rule}当前数量上限为 0，因此本组不安排复习词。`
  }
  if (dueReviewCount === 0 && actualCount > 0) {
    return `${rule}当前没有到期复习词，已按“加入随机复习”设置从已学单词中随机加入 ${actualCount} 个。`
  }
  if (actualCount < reviewWordLimit) {
    return `${rule}当前只有 ${actualCount} 个符合条件的到期词，因此本组安排 ${actualCount} 个，不会用未到期词补足。`
  }
  return `${rule}当前本组安排 ${actualCount} 个，已达到数量上限。`
})

async function resetCacheData() {
  if (unsupportedCacheVersion) return
  isSaveData && flushStatToStore(practiceData.statStoreData)
  isSaveData = false
  practiceData.practiceData = null
  practiceData.statStoreData = null
  practiceData.sessionSnapshot = undefined
  await wordPersistence.clear()
}

// runtimeStore.globalLoading练习界面，退出时会调用一个保存，可能会卡住。当调用完成再init
//  immediate: true 比 onUmMounted 先执行，只能延时执行
watch(
  [() => store.load, () => runtimeStore.globalLoading],
  debounce(([a, b]) => {
    if (a && !b) {
      init()
      _nextTick(async () => {
        // 引导只给第一次来的用户看：不需要时连引导库都不加载
        if (!settingStore.first || localStorage.getItem('tour-guide') || isMobile()) return
        const Shepherd = await loadJsLib('Shepherd', LIB_JS_URL.SHEPHERD)
        const tour = new Shepherd.Tour(TourConfig)
        tour.on('cancel', () => {
          localStorage.setItem('tour-guide', '1')
        })
        // 从词典页“选择词典”回来：继续第 4 步，指向开始学习
        if (route.query.guide && store.sdict.id) {
          tour.addStep({
            id: 'step4',
            text: '词典已选好，点击这里开始学习',
            attachTo: { element: '#step4', on: 'bottom' },
            buttons: [
              {
                text: `下一步（4/${TourConfig.total}）`,
                action() {
                  tour.complete()
                  guiding = true
                  systemPractice()
                },
              },
            ],
          })
          tour.start()
          return
        }
        tour.addStep({
          id: 'step1',
          text: '点击这里选择一本词典开始学习',
          attachTo: {
            element: '#step1',
            on: 'bottom',
          },
          buttons: [
            {
              text: `下一步（1/${TourConfig.total}）`,
              action() {
                tour.next()
                router.push('/dict-list')
              },
            },
          ],
        })
        tour.start()
      }, 500)
    }
  }),
  { immediate: true }
)

async function onvisibilitychange() {
  if (!document.hidden) {
    //当页面可见时，检查是否需要从缓存恢复
    const d = await loadPracticeCache()
    if (d) {
      practiceData = d
      isSaveData = true
    }
  }
}

let wordCatalog: any[] | null = null

async function init(opts: { fresh?: boolean } = {}) {
  busyStart()
  try {
    await prepareStudy(opts)
  } finally {
    busyEnd()
    if (!firstInitDone) {
      firstInitDone = true
      busyEnd()
    }
  }
}

async function prepareStudy(opts: { fresh?: boolean }) {
  document.removeEventListener('visibilitychange', onvisibilitychange)
  document.addEventListener('visibilitychange', onvisibilitychange)

  let studyIndex = store.word.studyIndex
  if (studyIndex >= 3) {
    if (!store.sdict.custom && !store.sdict.words.length) {
      // 目录和单词一起下载；目录只下载一次，内置词书的单词由 _getDictDataByUrl 缓存
      const [dictList, dict] = await Promise.all([
        wordCatalog ?? fetch(resourceWrap(DICT_LIST.WORD.ALL)).then(r => r.json()),
        _getDictDataByUrl(store.sdict),
      ])
      wordCatalog = dictList
      let r = dictList.find(v => [v.enName, v.id].includes(store.sdict.id))
      if (r) {
        store.word.bookList[studyIndex].words = dict.words
        store.word.bookList[studyIndex].id = r.id
        store.word.bookList[studyIndex].enName = r.enName
        store.word.bookList[studyIndex].cover = r.cover
        store.word.bookList[studyIndex].category = r.category
        store.word.bookList[studyIndex].tags = r.tags
        store.word.bookList[studyIndex].url = r.url
        store.word.bookList[studyIndex].description = r.description
        store.word.bookList[studyIndex].name = r.name
      } else {
        store.word.bookList[studyIndex] = dict
      }
      store.word.bookList[studyIndex].length = dict.words.length
      let s = store.word.bookList[studyIndex]
      if (s.lastLearnIndex > s.length) {
        store.word.bookList[studyIndex].lastLearnIndex = s.length
        store.word.bookList[studyIndex].complete = true
        await resetCacheData()
      }
    }
  }

  if (opts.fresh || (!practiceData?.taskWords.new.length && store.sdict.words.length)) {
    const d = store.sdict.words.length ? await loadPracticeCache() : null
    // 算好之后一次性换上：数字只滚动一次，不会先变成 0 再变成新值
    if (d) {
      practiceData = d
      isSaveData = true
    } else {
      if (opts.fresh) {
        practiceData = { taskWords: { new: [], review: [] } } as any
        isSaveData = false
        dueReviewCount = 0
      }
      if (!unsupportedCacheVersion && store.sdict.words.length) refreshStudyTask()
    }
  }
}

async function startPractice(practiceMode: WordPracticeMode, resetCache: boolean = false): Promise<void> {
  await whenReady()
  if (unsupportedCacheVersion) {
    Toast.error('当前客户端无法读取这份练习缓存，请升级后再继续')
    return
  }
  if (practiceMode === WordPracticeMode.Custom) {
    const activeCustomFlowId = getActiveCustomFlowId()
    if (!activeCustomFlowId || !getUserFlow(activeCustomFlowId)) {
      Toast.warning('请先创建并激活一个自定义流程')
      router.push('/practice-flow-editor')
      return
    }
  }
  if (resetCache) await resetCacheData()

  if (shouldShowDialogPracticeMode.includes(practiceMode) && !isSaveData) {
    editingWordPracticeMode = practiceMode
    showShufflePracticeSettingDialog = true
    return
  }

  if (store.sdict.id) {
    if (!store.sdict.words.length) {
      Toast.warning('没有单词可学习！')
      return
    }

    settingStore.wordPracticeMode = practiceMode

    window.umami?.track('startStudyWord', {
      name: store.sdict.name,
      index: String(store.sdict.lastLearnIndex),
      perDayStudyNumber: String(store.sdict.perDayStudyNumber),
      custom: store.sdict.custom,
      complete: store.sdict.complete,
      wordPracticeMode: String(settingStore.wordPracticeMode),
    })
    //把是否是第一次设置为false（新手引导中则留给练习页的最后一步去关）
    if (settingStore.first && !guiding) settingStore.first = false
    nav(WordPracticeModeUrlMap[practiceMode] + '/' + store.sdict.id, guiding ? { guide: 1 } : {}, practiceData)
  } else {
    window.umami?.track('no-dict')
    Toast.warning('请先选择一本词典')
  }
}

function freePractice() {
  startPractice(WordPracticeMode.Free, settingStore.wordPracticeMode !== WordPracticeMode.Free)
}

function systemPractice() {
  const currentMode = settingStore.wordPracticeMode
  const isFree = currentMode === WordPracticeMode.Free
  startPractice(isFree ? WordPracticeMode.System : currentMode, isFree)
}

let editingWordPracticeMode = $ref(0)

let showPracticeSettingDialog = $ref(false)
let showShufflePracticeSettingDialog = $ref(false)
let showChangeLastPracticeIndexDialog = $ref(false)
let showPracticeWordListDialog = $ref(false)

type StudyDayRow = Statistics & { dictName: string }

let showStudyDayDialog = $ref(false)
let selectedStudyDateKey = $ref('')
let studyDayRecords = $ref<StudyDayRow[]>([])

const allWordStatistics = $computed(() => store.word.bookList.flatMap(book => book.statistics ?? []))

/** 年度活动热力图：每天学了几个词（含正在进行、还没练完的那一组的时间） */
const dailyActivity = $computed(() =>
  buildDailyActivity(
    store.word.bookList.map(book => book.statistics ?? []),
    isSaveData ? practiceData.statStoreData : null
  )
)

const cacheSpendMs = $computed(() => practiceData.statStoreData?.spend ?? 0)

const todayDateKey = $computed(() => dayjs().format('YYYY-MM-DD'))

/**
 * 缓存记录中每一天对应的学习毫秒数 Map<'YYYY-MM-DD', spendMs>
 * 有 segments 时按片段精确分组，否则退回到 startDate + spend 整体归一天
 */
const cacheDaySpendMap = $computed((): Map<string, number> => {
  const st = practiceData.statStoreData
  const map = new Map<string, number>()
  if (!st?.spend) return map
  if (Array.isArray(st.segments) && st.segments.length > 0) {
    for (const [segStart, segEnd] of st.segments) {
      const key = dayjs(segStart).format('YYYY-MM-DD')
      map.set(key, (map.get(key) ?? 0) + (segEnd - segStart))
    }
  } else {
    // 老数据 / 无 segments：全部归到 startDate 那天
    map.set(dayjs(st.startDate).format('YYYY-MM-DD'), st.spend)
  }
  return map
})

const todayCacheMs = $computed(() => cacheDaySpendMap.get(todayDateKey) ?? 0)

const calendarHighlightDates = $computed(() => {
  const set = new Set<string>()
  for (const s of allWordStatistics) {
    set.add(dayjs(s.startDate).format('YYYY-MM-DD'))
  }
  // 把缓存记录中所有出现过的天都高亮（支持跨天）
  for (const key of cacheDaySpendMap.keys()) {
    set.add(key)
  }
  return [...set]
})

/** 已落库统计总毫秒（全 bookList） */
const persistedTotalMs = $computed(() => total(allWordStatistics, 'spend'))

const totalSpend = $computed(() => {
  const sum = persistedTotalMs + cacheSpendMs
  if (!sum) return 0
  return msToHourMinute(sum)
})

const todayTotalSpend = $computed(() => {
  const todayPersistedMs = total(
    allWordStatistics.filter(v => dayjs(v.startDate).isSame(dayjs(), 'day')),
    'spend'
  )
  const sum = todayPersistedMs + todayCacheMs
  if (!sum) return 0
  return msToHourMinute(sum)
})

const totalDay = $computed(() => {
  const set = new Set(allWordStatistics.map(v => dayjs(v.startDate).format('YYYY-MM-DD')))
  // 把缓存记录中所有出现过的天都计入（支持跨天）
  for (const key of cacheDaySpendMap.keys()) {
    set.add(key)
  }
  return set.size
})

const studyDayDialogTitle = $computed(() =>
  selectedStudyDateKey ? `${dayjs(selectedStudyDateKey).format('YYYY年M月D日')} 学习记录` : ''
)

function isStudyDayKeyToday(dateKey: string) {
  return dateKey === dayjs().format('YYYY-MM-DD')
}

function onSelectCalendarDate(dateKey: string) {
  selectedStudyDateKey = dateKey
  const rows: StudyDayRow[] = []
  for (const book of store.word.bookList) {
    for (const stat of book.statistics ?? []) {
      if (dayjs(stat.startDate).format('YYYY-MM-DD') === dateKey) {
        rows.push({ ...stat, dictName: book.name })
      }
    }
  }
  const st = practiceData.statStoreData
  // 缓存记录跨天时，只要该天在 cacheDaySpendMap 中有记录就展示
  if (st?.spend && cacheDaySpendMap.has(dateKey)) {
    const daySpend = cacheDaySpendMap.get(dateKey)!
    const cacheKeys = [...cacheDaySpendMap.keys()]
    const keyIdx = cacheKeys.indexOf(dateKey)
    const isMultiDay = cacheKeys.length > 1
    // 推算该天在整次练习中的角色（练习未结束，最后一天标为"学习中"而非"学习结束"）
    let sessionRole: StudyDayRow['sessionRole']
    if (!isMultiDay) {
      sessionRole = 'single'
    } else if (keyIdx === 0) {
      sessionRole = 'start'
    } else if (keyIdx === cacheKeys.length - 1) {
      sessionRole = 'middle' // 最后一天仍在进行中，用 middle 表示
    } else {
      sessionRole = 'middle'
    }
    rows.push({
      ...st,
      spend: daySpend,
      new: st.newWordNumber,
      review: st.reviewWordNumber,
      dictName: store.sdict.name,
      sessionRole,
    })
  }
  if (!rows.length) return Toast.info('无学习记录')
  studyDayRecords = rows
  showStudyDayDialog = true
}

async function goDictDetail(val: DictResource) {
  if (!val.id) return nav('dict-list')
  // 推荐里的词典如果已经学过，带上已学进度打开
  runtimeStore.editDict = withSavedProgress(val as any)
  nav('/dict', {})
}

let isManageDict = $ref(false)
let selectIds = $ref([])

// ── 选择词典：只在“我的词典”里选，选中后就地切换，留在首页继续学 ──
let showDictPicker = $ref(false)

async function onPickMyDict(dict: Dict) {
  if (isSameDictResource(store.sdict, dict)) return
  busyStart()
  try {
    // 需要已学进度的模式（复习、随机等）换词典后可能用不了，换成常规学习
    if (![WordPracticeMode.Free, WordPracticeMode.System].includes(settingStore.wordPracticeMode)) {
      settingStore.wordPracticeMode = WordPracticeMode.System
    }
    // 两本词典各自没练完的那一组会被收好 / 放回（见 dict-switch.ts）
    await switchStudyDict(getDefaultDict(dict))
    await init({ fresh: true })
    Toast.success(`已切换到「${store.sdict.name}」`)
  } catch (e) {
    console.error(e)
    Toast.error('切换词典失败，请重试')
  } finally {
    busyEnd()
  }
}

// 打开“选择词典”时，顺手在后台把列表里的内置词书先下载好，点下去就能直接切换
watch(
  () => showDictPicker,
  open => {
    if (!open) return
    setTimeout(() => {
      if (!showDictPicker) return
      for (const d of store.word.bookList.slice(3)) {
        if (d.custom || d.system || d.words.length || !d.url || isSameDictResource(d, store.sdict)) continue
        _getDictDataByUrl(d).catch(() => {})
      }
    }, 250)
  }
)

// 词典列表里前三本是内置的 收藏 / 错词 / 已掌握；展示时自己的在前，内置的放最后
const builtinBooks = $computed(() => store.word.bookList.slice(0, 3))
const myBooks = $computed(() => store.word.bookList.slice(3))

async function handleBatchDel() {
  selectIds.forEach(id => {
    let r = store.word.bookList.findIndex(v => v.id === id)
    if (r !== -1) {
      if (store.word.studyIndex === r) {
        store.word.studyIndex = -1
      }
      if (store.word.studyIndex > r) {
        store.word.studyIndex--
      }
      store.word.bookList.splice(r, 1)
    }
  })
  selectIds = []
  Toast.success('删除成功！')
}

function toggleSelect(item) {
  let rIndex = selectIds.findIndex(v => v === item.id)
  if (rIndex > -1) {
    selectIds.splice(rIndex, 1)
  } else {
    selectIds.push(item.id)
  }
}

const progressTextLeft = $computed(() => {
  if (store.sdict.complete) return '已学完，进入总复习阶段'
  return '当前进度：已学' + store.currentStudyProgress + '%'
})

function check(cb: Function) {
  if (!store.sdict.id) {
    Toast.warning('请先选择一本词典')
  } else {
    runtimeStore.editDict = getDefaultDict(store.sdict)
    cb()
  }
}

async function savePracticeSetting() {
  await resetCacheData()
  await store.changeDict(runtimeStore.editDict)
  refreshStudyTask()
  Toast.success('修改成功')
}

async function onShufflePracticeSettingOk(setting: ShufflePracticeSetting) {
  await dataSync.saveDictState()
  await resetCacheData()
  settingStore.wordPracticeMode = editingWordPracticeMode

  window.umami?.track('startStudyWord', {
    name: store.sdict.name,
    index: store.sdict.lastLearnIndex,
    perDayStudyNumber: store.sdict.perDayStudyNumber,
    custom: store.sdict.custom,
    complete: store.sdict.complete,
    wordPracticeMode: settingStore.wordPracticeMode,
  })

  const result = getShufflePracticeWords(store.sdict.words, setting, store.getIgnoreWordsSet())
  practiceData.taskWords.review = result.words
  nav(
    WordPracticeModeUrlMap[editingWordPracticeMode] + '/' + store.sdict.id,
    {},
    {
      ...practiceData,
      total: result.words.length,
      shuffleRange: result.range,
    }
  )
}

async function saveLastPracticeIndex(e) {
  runtimeStore.editDict.lastLearnIndex = e
  showChangeLastPracticeIndexDialog = false
  await resetCacheData()
  await store.changeDict(runtimeStore.editDict)
  refreshStudyTask()
  Toast.success('修改成功')
}

const { data: recommendDictList, isFetching } = useFetch(resourceWrap(DICT_LIST.WORD.RECOMMENDED)).json()

const systemPracticeText = $computed(() => {
  if (settingStore.wordPracticeMode === WordPracticeMode.Free) {
    return '开始学习'
  } else if (settingStore.wordPracticeMode === WordPracticeMode.Custom) {
    return isSaveData ? '继续自定义练习' : '开始自定义练习'
  } else {
    return isSaveData
      ? '继续' + WordPracticeModeNameMap[settingStore.wordPracticeMode]
      : '开始' + WordPracticeModeNameMap[settingStore.wordPracticeMode]
  }
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onvisibilitychange)
})
</script>


<template>
  <BasePage>
    <div class="bento words-bento">
      <!-- ── 当前词典 ── -->
      <section class="tile tile-dict" style="--i: 0">
        <div class="flex items-center gap-3">
          <div class="tile-icon">
            <IconLineMdTextBoxMultiple />
          </div>
          <div @click="goDictDetail(store.sdict)" class="dict-name swap-in" :key="String(store.sdict.id)">
            {{ store.sdict.name || $t('no_dict_selected') }}
          </div>
        </div>

        <template v-if="store.sdict.id">
          <div class="mt-5 space-y-2 swap-in" :key="String(store.sdict.id)">
            <div class="text-sm flex justify-between muted">
              <span v-opacity="store.sdict.id && store.sdict.lastLearnIndex < store.sdict.length">
                {{ $t('estimated_completion') }}：{{
                  _getAccomplishDate(
                    store.sdict.words.length - store.sdict.lastLearnIndex,
                    store.sdict.perDayStudyNumber
                  )
                }}
              </span>
            </div>
            <Progress size="large" :percentage="store.currentStudyProgress" :show-text="false"></Progress>

            <div class="text-sm flex justify-between">
              <span>{{ progressTextLeft }}</span>
              <span class="tabular-nums"> {{ store.sdict?.lastLearnIndex }} / {{ store.sdict.length }} 词</span>
            </div>
          </div>
          <div class="dict-actions flex items-center mt-5 gap-3 flex-wrap">
            <div class="dict-picker-anchor">
              <BaseButton
                type="info"
                size="small"
                :aria-expanded="showDictPicker"
                @click="showDictPicker = !showDictPicker"
              >
                <div class="center gap-1">
                  <IconLucideArrowLeftRight class="i-flip" />
                  <span>{{ $t('select_dict') }}</span>
                </div>
              </BaseButton>
              <MyDictPicker v-model="showDictPicker" @select="onPickMyDict" />
            </div>
            <PopConfirm
              :disabled="!isSaveData"
              title="当前存在未完成的学习任务，修改会重新生成学习任务，是否继续？"
              @confirm="check(() => (showChangeLastPracticeIndexDialog = true))"
            >
              <BaseButton type="info" size="small" v-if="store.sdict.id">
                <div class="center gap-1">
                  <IconLineMdEdit class="i-tilt" />
                  <span>{{ $t('change_progress') }}</span>
                </div>
              </BaseButton>
            </PopConfirm>
          </div>
        </template>

        <div class="flex items-center gap-4 mt-5 flex-1 flex-wrap" v-else>
          <div class="title">{{ $t('select_dict_to_start') }}</div>
          <BaseButton id="step1" type="primary" size="large" @click="router.push('/dict-list')">
            <div class="center gap-1">
              <IconLineMdPlus class="i-rotate" />
              <span>{{ $t('select_dict') }}</span>
            </div>
          </BaseButton>
        </div>
      </section>

      <!-- ── 今日任务（主卡片） ── -->
      <section class="tile tile--brand tile-task" style="--i: 1">
        <div class="task-inner" :class="!store.sdict.id && 'is-empty'">
          <div class="tile-head">
            <div class="flex items-center gap-2">
              <div class="tile-icon">
                <IconLineMdStarFilled class="task-star" />
              </div>
              <div class="text-xl font-bold task-title">
                {{ isSaveData ? $t('last_task') : $t('today_task') }}
              </div>
              <span class="task-link" v-if="store.sdict.id" @click="showPracticeWordListDialog = true">{{
                $t('word_list')
              }}</span>
              <!--            <span class="color-link cursor-pointer ml-2" @click="nav('/practice-flow-editor', {})">流程编排</span>-->
            </div>
            <div class="flex gap-1.5 items-center goal" v-if="store.sdict.id">
              {{ $t('daily_goal') }}
              <div class="goal-num">
                <RollNumber :value="store.sdict.id ? store.sdict.perDayStudyNumber : 0" />
              </div>
              {{ $t('words_count') }}
              <PopConfirm
                :disabled="!isSaveData"
                title="当前存在未完成的学习任务，修改会重新生成学习任务，是否继续？"
                @confirm="check(() => (showPracticeSettingDialog = true))"
              >
                <BaseButton type="info" size="small">{{ $t('change') }}</BaseButton>
              </PopConfirm>
            </div>
          </div>
          <div class="flex mt-5 gap-3">
            <div class="stat">
              <div class="num"><RollNumber :value="practiceData?.taskWords?.new?.length ?? 0" /></div>
              <div class="txt">{{ $t('new_words') }}</div>
            </div>
            <div class="stat">
              <div class="num flex center">
                <RollNumber :value="practiceData?.taskWords?.review?.length ?? 0" />
                <span class="no-due" v-if="!practiceData?.taskWords?.review?.length">(暂无到期词)</span>
              </div>
              <div class="txt flex center gap-1">
                <span>{{ $t('review') }}</span>
                <Tooltip>
                  <IconLineMdQuestionCircle class="mt-.5" width="18" />
                  <template #reference>
                    <div class="whitespace-pre-wrap">{{ reviewWordTip }}</div>
                  </template>
                </Tooltip>
              </div>
              <div class="center gap-2 mt-1 text-sm" v-if="!isSaveData && dueReviewCount === 0">
                <span>加入随机复习</span>
                <Switch :model-value="settingStore.autoAddRandomReviewWhenNoDue" @change="toggleAutoAddRandomReview" />
              </div>
            </div>
          </div>
          <div class="flex items-end mt-5 gap-3 btn-no-margin">
            <OptionButton
              :class="settingStore.wordPracticeMode !== WordPracticeMode.Free ? 'flex-1 orange-btn' : 'primary-btn'"
            >
              <BaseButton
                id="step4"
                size="large"
                :type="settingStore.wordPracticeMode !== WordPracticeMode.Free ? 'orange' : 'primary'"
                :disabled="!store.sdict.id"
                :loading="loading"
                @click="systemPractice"
              >
                <div class="flex items-center gap-2">
                  <span class="line-height-[2]">{{ systemPracticeText }}</span>
                  <IconLineMdArrowRightCircle class="text-xl cta-arrow" />
                </div>
              </BaseButton>
              <template #options>
                <BaseButton
                  class="w-full"
                  v-if="
                    settingStore.wordPracticeMode !== WordPracticeMode.System &&
                    settingStore.wordPracticeMode !== WordPracticeMode.Free
                  "
                  @click="startPractice(WordPracticeMode.System, true)"
                >
                  {{ $t('smart_learning') }}
                </BaseButton>

                <BaseButton
                  class="w-full"
                  v-if="settingStore.wordPracticeMode !== WordPracticeMode.Review"
                  :disabled="!practiceData?.taskWords?.review?.length"
                  @click="startPractice(WordPracticeMode.Review, true)"
                >
                  {{ $t('review') }}
                </BaseButton>
                <BaseButton
                  class="w-full"
                  v-if="settingStore.wordPracticeMode !== WordPracticeMode.Shuffle"
                  :disabled="store.sdict.lastLearnIndex < 10 && !store.sdict.complete"
                  @click="startPractice(WordPracticeMode.Shuffle, true)"
                >
                  {{ $t('random_review') }}
                </BaseButton>
                <BaseButton
                  class="w-full"
                  v-if="settingStore.wordPracticeMode !== WordPracticeMode.ReviewWordsTest"
                  :disabled="store.sdict.lastLearnIndex < 10 && !store.sdict.complete"
                  @click="startPractice(WordPracticeMode.ReviewWordsTest, true)"
                >
                  {{ $t('words') }}{{ $t('test') }}
                </BaseButton>
                <BaseButton
                  class="w-full"
                  v-if="settingStore.wordPracticeMode !== WordPracticeMode.ShuffleWordsTest"
                  :disabled="store.sdict.lastLearnIndex < 10 && !store.sdict.complete"
                  @click="startPractice(WordPracticeMode.ShuffleWordsTest, true)"
                >
                  {{ $t('random_words_test') }}
                </BaseButton>
              </template>
            </OptionButton>

            <BaseButton
              :class="settingStore.wordPracticeMode === WordPracticeMode.Free ? 'flex-1' : ''"
              :type="settingStore.wordPracticeMode === WordPracticeMode.Free ? 'orange' : 'primary'"
              size="large"
              :loading="loading"
              @click="freePractice()"
            >
              <div class="flex items-center gap-2">
                <span class="line-height-[2]">
                  {{
                    settingStore.wordPracticeMode === WordPracticeMode.Free && isSaveData
                      ? $t('continue_free_practice')
                      : $t('free_practice')
                  }}
                </span>
                <IconLineMdPencil class="text-xl i-tilt" />
              </div>
            </BaseButton>
          </div>
        </div>
      </section>

      <!-- ── 统计 ── -->
      <section class="tile tile-stats" style="--i: 2">
        <div class="title">统计</div>
        <div class="stat-grid">
          <div class="stat2 tone-brand">
            <div class="stat2-icon"><IconLucideTimer /></div>
            <div class="num"><RollNumber :value="todayTotalSpend" /></div>
            <div class="txt">{{ $t('today_study_time') }}</div>
          </div>
          <div class="stat2 tone-sky">
            <div class="stat2-icon"><IconLineMdCalendar /></div>
            <div class="num"><RollNumber :value="totalDay" /></div>
            <div class="txt">{{ $t('total_study_days') }}</div>
          </div>
          <div class="stat2 tone-deep">
            <div class="stat2-icon"><IconLucideHourglass /></div>
            <div class="num"><RollNumber :value="totalSpend" /></div>
            <div class="txt">{{ $t('total_study_time') }}</div>
          </div>
        </div>
      </section>

      <!-- ── 日历 ── -->
      <section class="tile tile-cal" style="--i: 3">
        <Calendar
          :highlighted-dates="calendarHighlightDates"
          @select-date="onSelectCalendarDate"
          :weekHeaderTitle="$t('this_week_record')"
        >
        </Calendar>
      </section>

      <!-- ── 年度活动 ── -->
      <section class="tile tile-heat" style="--i: 4">
        <ActivityHeatmap :activity="dailyActivity" @select-date="onSelectCalendarDate" />
      </section>

      <!-- ── 我的词典 ── -->
      <section class="tile tile-shelf" style="--i: 5">
        <div class="tile-head">
          <div class="title">{{ $t('my_dictionaries') }}</div>
          <div class="tile-actions">
            <PopConfirm title="确认删除所有选中词典？" @confirm="handleBatchDel" v-if="selectIds.length">
              <BaseIcon class="del" :title="$t('delete')">
                <DeleteIcon />
              </BaseIcon>
            </PopConfirm>

            <div
              class="color-link cursor-pointer"
              v-if="store.word.bookList.length > 3"
              @click="
                () => {
                  isManageDict = !isManageDict
                  selectIds = []
                }
              "
            >
              {{ isManageDict ? $t('cancel') : $t('manage_dict') }}
            </div>
            <div class="color-link cursor-pointer" @click="nav('/dict', { isAdd: true })">
              {{ $t('create_personal_dict') }}
            </div>
          </div>
        </div>
        <!-- 自己的词典排在最前（放不下就往下排），收藏 / 错词 / 已掌握 这三本内置词典固定放在最后一排 -->
        <div class="shelf">
          <Book
            :is-add="false"
            quantifier="词"
            :item="item"
            :checked="selectIds.includes(item.id)"
            @check="() => toggleSelect(item)"
            :show-checkbox="isManageDict"
            v-for="item in myBooks"
            :key="item.id"
            @click="goDictDetail(item)"
          />
          <Book :is-add="true" @click="router.push('/dict-list')" />
        </div>
        <div class="shelf shelf--builtin">
          <Book
            :is-add="false"
            quantifier="词"
            :item="item"
            v-for="item in builtinBooks"
            :key="item.id"
            @click="goDictDetail(item)"
          />
        </div>
      </section>

      <!-- ── 推荐 ── -->
      <section class="tile tile-shelf overflow-hidden" style="--i: 6" v-loading="isFetching">
        <div class="tile-head">
          <div class="title">{{ $t('recommend') }}</div>
          <div class="tile-actions">
            <div class="color-link cursor-pointer" @click="router.push('/dict-list')">{{ $t('more') }}</div>
          </div>
        </div>

        <div class="shelf min-h-50">
          <Book
            :is-add="false"
            quantifier="词"
            :item="item as any"
            v-for="(item, j) in recommendDictList"
            @click="goDictDetail(item as any)"
          />
        </div>
      </section>
    </div>
  </BasePage>

  <PracticeSettingDialog
    :show-left-option="false"
    v-model="showPracticeSettingDialog"
    :onConfirm="savePracticeSetting"
  />

  <ChangeLastPracticeIndexDialog v-model="showChangeLastPracticeIndexDialog" @ok="saveLastPracticeIndex" />

  <PracticeWordListDialog :data="practiceData?.taskWords" v-model="showPracticeWordListDialog" />

  <ShufflePracticeSettingDialog
    v-model="showShufflePracticeSettingDialog"
    :onConfirm="onShufflePracticeSettingOk"
    :wordPracticeMode="editingWordPracticeMode"
  />

  <Dialog v-model="showStudyDayDialog" :title="studyDayDialogTitle" :footer="false" :padding="true">
    <div
      v-if="!studyDayRecords.length && !(isStudyDayKeyToday(selectedStudyDateKey) && todayCacheMs > 0)"
      class="text-gray-500 py-6 text-center"
    >
      当日无学习记录
    </div>
    <ul v-if="studyDayRecords.length" class="study-day-list max-h-70vh overflow-y-auto space-y-3">
      <li v-for="(row, idx) in studyDayRecords" :key="idx" class="border-b border-gray-200 pb-3 last:border-0">
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ row.dictName }}</span>
          <span
            v-if="row.sessionRole && row.sessionRole !== 'single'"
            class="text-xs px-1.5 py-0.5 rounded-full"
            :class="{
              'bg-green-100 text-green-700': row.sessionRole === 'start',
              'bg-blue-100 text-blue-700': row.sessionRole === 'middle',
              'bg-orange-100 text-orange-700': row.sessionRole === 'end',
            }"
          >
            {{ { start: '学习开始', middle: '学习中', end: '学习结束' }[row.sessionRole] }}
          </span>
        </div>
        <div class="text-sm text-gray-600 mt-1">
          时长 {{ msToHourMinute(row.spend) }} · 新学 {{ row.new }} · 复习 {{ row.review }} · 错词 {{ row.wrong }}
          <template v-if="row.total"> · 共 {{ row.total }} 词</template>
        </div>
      </li>
    </ul>
  </Dialog>
</template>

<style scoped lang="scss">
/* ── Bento placement ──────────────────────────────────────────
 * wide:   [dict 5 | task 7] [stats 7 | calendar 5] [activity 12] [shelf 12] [shelf 12]
 * medium: [dict 6 | task 6] [stats 12] [calendar 12] [activity 12] …
 * narrow: one column
 */
.words-bento {
  .tile-dict {
    grid-column: span 5;
  }

  .tile-task {
    grid-column: span 7;
  }

  .tile-stats {
    grid-column: span 7;
  }

  .tile-cal {
    grid-column: span 5;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tile-shelf,
  .tile-heat {
    grid-column: 1 / -1;
  }
}

@media (max-width: 1199px) {
  .words-bento {
    .tile-dict,
    .tile-task {
      grid-column: span 6;
    }

    .tile-stats,
    .tile-cal {
      grid-column: 1 / -1;
    }
  }
}

@media (max-width: 899px) {
  .words-bento {
    .tile-dict,
    .tile-task {
      grid-column: 1 / -1;
    }
  }
}

/* ── Current dictionary ── */
.tile-dict {
  display: flex;
  flex-direction: column;

  .dict-picker-anchor {
    position: relative;
    display: inline-flex;
  }

  .dict-name {
    @apply text-2xl font-bold cursor-pointer;
    color: var(--color-ink-1);
    letter-spacing: -0.02em;
    line-height: 1.25;
    transition: color var(--dur-hover) ease;

    &:hover {
      color: var(--color-brand-text);
    }
  }

  .muted {
    color: var(--color-ink-3);
  }
}

/* ── Today's task (brand tile) ── */
.tile-task {
  .task-inner {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: opacity var(--dur-tile) ease;

    &.is-empty {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  .task-star {
    color: #fff;
  }

  .task-title {
    color: #fff;
    letter-spacing: -0.01em;
  }

  .task-link {
    @apply cursor-pointer text-sm inline-block;
    margin-left: 0.25rem;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
    transition:
      background-color var(--dur-hover) ease,
      transform 160ms var(--ease-out);

    &:hover {
      background: rgba(255, 255, 255, 0.24);
    }

    &:active {
      transform: scale(0.95);
      transition-duration: var(--dur-hover), var(--dur-press);
    }
  }

  .goal {
    color: rgba(255, 255, 255, 0.85);
  }

  .goal-num {
    @apply flex items-center justify-center text-2xl font-bold tabular-nums;
    min-width: 2.75rem;
    height: 2.5rem;
    padding: 0 0.6rem;
    border-radius: 0.75rem;
    color: #fff;
    background: rgba(255, 255, 255, 0.16);
    box-sizing: border-box;
  }

  .stat {
    @apply flex-1 box-border flex flex-col items-center justify-center p-3;
    border-radius: var(--radius-inner);
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.14);

    .num {
      @apply text-4xl;
      font-family: var(--font-display);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
      color: #fff;
    }

    .txt {
      color: rgba(255, 255, 255, 0.78);
    }

    .no-due {
      @apply text-base ml-1;
      font-weight: 400;
      color: rgba(255, 255, 255, 0.72);
    }
  }

  /* controls re-toned for the brand surface —— 但不包括“继续学习”下拉菜单里的项：菜单是浅色浮层，保持菜单自己的配色 */
  :deep(.base-button.info:not(.options-pop *)) {
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.28);
    color: #fff;

    &:hover:not(.disabled) {
      background: rgba(255, 255, 255, 0.24);
      border-color: rgba(255, 255, 255, 0.4);
    }
  }

  /* the non-current mode sits back as a translucent button; the current mode ("orange") is the white CTA */
  :deep(.base-button.primary:not(.disabled):not(.options-pop *)) {
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.32);
    color: #fff;
    box-shadow: none;

    &:hover {
      background: rgba(255, 255, 255, 0.24);
    }
  }

  :deep(.base-button.disabled:not(.options-pop *)) {
    background: rgba(255, 255, 255, 0.18) !important;
    color: rgba(255, 255, 255, 0.7) !important;
    box-shadow: none;
  }

  :deep(.primary-btn .more) {
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
    border-left-color: rgba(255, 255, 255, 0.28);

    &:hover {
      background: rgba(255, 255, 255, 0.24);
    }
  }

  :deep(.switch.primary) {
    background: rgba(255, 255, 255, 0.28);

    .text {
      color: #fff;
    }

    &.checked {
      background: #fff;

      .ball {
        background: var(--color-brand);
      }

      .text {
        color: var(--color-brand);
      }
    }
  }
}

/* ── Stats ── */
.tile-stats {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;

  .stat-grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .stat2 {
    --tone: var(--color-brand-text);
    --tone-soft: var(--color-brand-soft);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 0.25rem;
    padding: 0.875rem 1rem;
    border-radius: var(--radius-inner);
    background: var(--color-tile-sunken);
    min-width: 0;

    &.tone-sky {
      --tone: var(--color-sky-text);
      --tone-soft: var(--color-sky-soft);
    }

    &.tone-deep {
      --tone: var(--color-brand-ink);
      --tone-soft: var(--color-brand-soft-2);
    }

    .stat2-icon {
      @apply flex items-center justify-center text-lg;
      width: 2rem;
      height: 2rem;
      margin-bottom: auto;
      border-radius: 0.6rem;
      color: var(--tone);
      background: var(--tone-soft);
    }

    .num {
      @apply text-2xl break-keep;
      margin-top: 0.75rem;
      font-family: var(--font-display);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
      color: var(--color-ink-1);
    }

    .txt {
      @apply text-sm;
      color: var(--color-ink-3);
    }
  }
}

@media (max-width: 480px) {
  .tile-stats {
    .stat-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.5rem;
    }

    /* compact rows on phones: icon | number / label */
    .stat2 {
      display: grid;
      grid-template-columns: 2rem minmax(0, 1fr);
      column-gap: 0.75rem;
      align-items: center;
      padding: 0.625rem 0.875rem;

      .stat2-icon {
        grid-row: span 2;
        margin: 0;
      }

      .num {
        margin: 0;
        font-size: 1.25rem;
      }
    }
  }

  /* stretch stacks both CTAs full-width */
  .tile-task .btn-no-margin {
    flex-direction: column;
    align-items: stretch;
  }
}

/* when the pair gets tight the second CTA drops to its own full-width line instead of overflowing */
.tile-task .btn-no-margin {
  flex-wrap: wrap;

  > :deep(.base-button) {
    flex-grow: 1;
  }
}

/* Container-aware placement: follows the grid's real width (the pinned rail eats ~150px),
   overriding the viewport fallbacks above where container queries are supported. */
@container (max-width: 1159px) {
  .words-bento .tile-dict,
  .words-bento .tile-task {
    grid-column: span 6;
  }

  .words-bento .tile-stats,
  .words-bento .tile-cal {
    grid-column: 1 / -1;
  }
}

@container (max-width: 979px) {
  .words-bento .tile-dict,
  .words-bento .tile-task {
    grid-column: 1 / -1;
  }
}

/* ── Shelves ── */
.tile-shelf {
  .shelf {
    @apply flex gap-4 flex-wrap mt-4;
  }
}

/* 手机：“选择词典”“更改进度”两个按钮并排、各占一半 */
@media (max-width: 560px) {
  .tile-dict .dict-actions {
    flex-wrap: nowrap;
    gap: 0.6rem;

    > * {
      flex: 1 1 0;
      min-width: 0;
    }

    :deep(.base-button) {
      width: 100%;
    }
  }
}

/* 手机：一排正好放 3 本（按页面留白、卡片内边距和间距算出书的宽度），书架不再一本本往下排 */
@media (max-width: 560px) {
  .tile-shelf .shelf {
    gap: 0.6rem;
    --book-width: calc((100vw - 2 * var(--page-gutter) - 2 * var(--tile-pad) - 2px - 2 * 0.6rem) / 3);
  }
}
</style>
