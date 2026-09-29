<script setup lang="ts">
import { BaseButton, BaseIcon, BasePage, DeleteIcon, PopConfirm, Progress, Toast } from '@/base'
import Book from '@/components/Book.vue'
import { APP_NAME, DICT_LIST } from '@/core/config/env.ts'
import { useBaseStore } from '@/core/stores/base.ts'
import { useRuntimeStore } from '@/core/stores/runtime.ts'
import { useSettingStore } from '@/core/stores/setting.ts'
import { getDefaultDict } from '@/core/types/func.ts'
import type { DictResource } from '@/core/types/types.ts'
import { _getDictDataByUrl, msToHourMinute, resourceWrap, total, useNav } from '@/core/utils'
import { useFetch } from '@vueuse/core'
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import isoWeek from 'dayjs/plugin/isoWeek'
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { DictType } from '@/core/types/enum.ts'
import { usePracticeArticlePersistence } from '@/core/composables/usePracticePersistence.ts'

dayjs.extend(isoWeek)
dayjs.extend(isBetween)

useSeoMeta({
  title: `英语文章跟打练习｜${APP_NAME}`,
  description: '在电脑上进行英语文章跟打、逐句精听和键盘输入练习，通过真实语境提升英语阅读、听力与拼写能力。',
  ogTitle: `英语文章跟打练习｜${APP_NAME}`,
  ogDescription: '使用英语文章跟打、逐句精听和键盘输入练习，在真实语境中提升英语能力。',
  twitterTitle: `英语文章跟打练习｜${APP_NAME}`,
  twitterDescription: '使用英语文章跟打、逐句精听和键盘输入练习，在真实语境中提升英语能力。',
})

const { nav } = useNav()
const base = useBaseStore()
const store = useBaseStore()
const settingStore = useSettingStore()
const router = useRouter()
const runtimeStore = useRuntimeStore()
let isSaveData = $ref(false)
const articlePersistence = usePracticeArticlePersistence()

watch(
  [() => store.load, () => runtimeStore.globalLoading],
  ([a, b]) => {
    if (a && !b) {
      init()
    }
  },
  { immediate: true }
)

async function onvisibilitychange() {
  if (!document.hidden) {
    //当页面可见时，检查是否需要从远程拉取数据
    const d = await articlePersistence.load()
    if (d) {
      isSaveData = true
    }
  }
}

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onvisibilitychange)
})

async function init() {
  document.removeEventListener('visibilitychange', onvisibilitychange)
  document.addEventListener('visibilitychange', onvisibilitychange)
  let studyIndex = store.article.studyIndex
  if (studyIndex >= 1) {
    if (!store.sbook.custom && !store.sbook.articles.length) {
      let dictList = await fetch(resourceWrap(DICT_LIST.ARTICLE.ALL)).then(r => r.json())
      let dict = await _getDictDataByUrl(store.sbook, DictType.article)
      let r = dictList.find(v => [v.enName, v.id].includes(store.sbook.id))
      if (r) {
        store.article.bookList[studyIndex].articles = dict.articles
        store.article.bookList[studyIndex].id = r.id
        store.article.bookList[studyIndex].enName = r.enName
        store.article.bookList[studyIndex].cover = r.cover
        store.article.bookList[studyIndex].category = r.category
        store.article.bookList[studyIndex].tags = r.tags
        store.article.bookList[studyIndex].url = r.url
        store.article.bookList[studyIndex].description = r.description
        store.article.bookList[studyIndex].name = r.name
      } else {
        store.article.bookList[studyIndex] = dict
      }
      store.article.bookList[studyIndex].length = dict.articles.length
      let s = store.article.bookList[studyIndex]
      if (s.lastLearnIndex > s.length) {
        store.article.bookList[studyIndex].lastLearnIndex = s.length
        store.article.bookList[studyIndex].complete = true
        //todo 后续加上
        // await resetCacheData()
      }
    }
  }
  const d = await articlePersistence.load()
  if (d) {
    isSaveData = true
  }
}

function startStudy() {
  // console.log(store.sbook.articles[1])
  // genArticleSectionData(cloneDeep(store.sbook.articles[1]))
  // return
  if (base.sbook.id) {
    if (!base.sbook.articles.length) {
      return Toast.warning('没有文章可学习！')
    }
    window.umami?.track('startStudyArticle', {
      name: base.sbook.name,
      custom: base.sbook.custom,
      complete: base.sbook.complete,
      s: `name:${base.sbook.name},index:${base.sbook.lastLearnIndex},title:${base.sbook.articles[base.sbook.lastLearnIndex].title}`,
    })
    nav('/practice-articles/' + store.sbook.id)
  } else {
    window.umami?.track('no-book')
    Toast.warning('请先选择一本书籍')
  }
}

let isMultiple = $ref(false)
let selectIds = $ref([])

function handleBatchDel() {
  selectIds.forEach(id => {
    let r = base.article.bookList.findIndex(v => v.id === id)
    if (r !== -1) {
      if (base.article.studyIndex === r) {
        base.article.studyIndex = -1
      }
      if (base.article.studyIndex > r) {
        base.article.studyIndex--
      }
      base.article.bookList.splice(r, 1)
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

async function goBookDetail(val: DictResource) {
  runtimeStore.editDict = getDefaultDict(val)
  // nav('book',{id: val.id})
  nav('/book/' + val.id)
}

const totalSpend = $computed(() => {
  if (base.sbook.statistics?.length) {
    return msToHourMinute(total(base.sbook.statistics, 'spend'))
  }
  return 0
})
const todayTotalSpend = $computed(() => {
  if (base.sbook.statistics?.length) {
    return msToHourMinute(
      total(
        base.sbook.statistics.filter(v => dayjs(v.startDate).isSame(dayjs(), 'day')),
        'spend'
      )
    )
  }
  return 0
})

const totalDay = $computed(() => {
  if (base.sbook.statistics?.length) {
    return new Set(base.sbook.statistics.map(v => dayjs(v.startDate).format('YYYY-MM-DD'))).size
  }
  return 0
})

const weekList = $computed(() => {
  const list = Array(7).fill(false)

  // 获取本周的起止时间
  const startOfWeek = dayjs().startOf('isoWeek') // 周一
  const endOfWeek = dayjs().endOf('isoWeek') // 周日

  store.sbook.statistics?.forEach(item => {
    const date = dayjs(item.startDate)
    if (date.isBetween(startOfWeek, endOfWeek, null, '[]')) {
      let idx = date.day()
      // dayjs().day() 0=周日, 1=周一, ..., 6=周六
      // 需要转换为 0=周一, ..., 6=周日
      if (idx === 0) {
        idx = 6 // 周日放到最后
      } else {
        idx = idx - 1 // 其余前移一位
      }
      list[idx] = true
    }
  })
  return list
})

const { data: recommendBookList, isFetching } = useFetch(resourceWrap(DICT_LIST.ARTICLE.RECOMMENDED)).json()
</script>

<template>
  <BasePage>
    <div class="bento articles-bento">
      <!-- ── 当前书籍封面 ── -->
      <section class="tile tile-cover" style="--i: 0">
        <Book
          v-if="base.sbook.id"
          :is-add="false"
          quantifier="篇"
          :item="base.sbook"
          :show-progress="false"
          @click="goBookDetail(base.sbook)"
        />
        <Book v-else :is-add="true" @click="router.push('/book-list')" />
      </section>

      <!-- ── 本周学习记录 ── -->
      <section class="tile tile-week" style="--i: 1">
        <div class="tile-head">
          <div class="flex items-center min-w-0 gap-4 flex-wrap">
            <div class="title truncate">{{ $t('this_week_record') }}</div>
            <div class="week-days">
              <div class="day" :class="item && 'is-done'" v-for="(item, i) in weekList" :key="i">
                {{ i + 1 }}
              </div>
            </div>
          </div>
          <div class="tile-actions" v-opacity="base.sbook.id">
            <div class="color-link cursor-pointer" @click="router.push('/book-list')">{{ $t('change_book') }}</div>
          </div>
        </div>
      </section>

      <!-- ── 统计 ── -->
      <section class="tile tile-stat tone-brand" style="--i: 2">
        <div class="stat-icon"><IconLucideTimer /></div>
        <div class="num">{{ todayTotalSpend }}</div>
        <div class="txt">{{ $t('today_study_time') }}</div>
      </section>
      <section class="tile tile-stat tone-sky" style="--i: 3">
        <div class="stat-icon"><IconLineMdCalendar /></div>
        <div class="num">{{ totalDay }}</div>
        <div class="txt">{{ $t('total_study_days') }}</div>
      </section>
      <section class="tile tile-stat tone-deep" style="--i: 4">
        <div class="stat-icon"><IconLucideHourglass /></div>
        <div class="num">{{ totalSpend }}</div>
        <div class="txt">{{ $t('total_study_time') }}</div>
      </section>

      <!-- ── 进度 + 开始（主卡片） ── -->
      <section class="tile tile--brand tile-go" style="--i: 5">
        <Progress
          class="go-progress"
          size="large"
          color="#ffffff"
          :percentage="base.currentBookProgress"
          :format="() => `${base.sbook?.lastLearnIndex || 0}/${base.sbook?.length || 0}篇`"
          :show-text="true"
        ></Progress>

        <BaseButton size="large" class="go-btn" @click="startStudy" :disabled="!base.sbook.name">
          <div class="flex items-center gap-2 justify-center w-full">
            <span class="line-height-[2]">{{ isSaveData ? $t('continue_learning') : $t('start_learning') }}</span>
            <IconLineMdArrowRightCircle class="text-xl cta-arrow" />
          </div>
        </BaseButton>
      </section>

      <!-- ── 我的书籍 ── -->
      <section class="tile tile-shelf" style="--i: 6">
        <div class="tile-head">
          <div class="title">{{ $t('my_books') }}</div>
          <div class="tile-actions">
            <PopConfirm title="确认删除所有选中书籍？" @confirm="handleBatchDel" v-if="selectIds.length">
              <BaseIcon class="del" :title="$t('delete')">
                <DeleteIcon />
              </BaseIcon>
            </PopConfirm>

            <div
              class="color-link cursor-pointer"
              v-if="base.article.bookList.length > 1"
              @click="
                () => {
                  isMultiple = !isMultiple
                  selectIds = []
                }
              "
            >
              {{ isMultiple ? $t('cancel') : $t('manage_books') }}
            </div>
            <div class="color-link cursor-pointer" @click="nav('/book/new', { isAdd: true })">
              {{ $t('create_personal_book') }}
            </div>
          </div>
        </div>
        <div class="shelf">
          <Book
            :is-add="false"
            :is-user="true"
            quantifier="篇"
            :item="item"
            :checked="selectIds.includes(item.id)"
            @check="() => toggleSelect(item)"
            :show-checkbox="isMultiple && j >= 1"
            v-for="(item, j) in base.article.bookList"
            @click="goBookDetail(item)"
          />
          <Book :is-add="true" @click="router.push('/book-list')" />
        </div>
      </section>

      <!-- ── 推荐 ── -->
      <section class="tile tile-shelf min-h-50" style="--i: 7" v-loading="isFetching">
        <div class="tile-head">
          <div class="title">{{ $t('recommend') }}</div>
          <div class="tile-actions">
            <div class="color-link cursor-pointer" @click="router.push('/book-list')">{{ $t('more') }}</div>
          </div>
        </div>

        <div class="shelf">
          <Book
            :is-add="false"
            quantifier="篇"
            :item="item as any"
            v-for="(item, j) in recommendBookList"
            @click="goBookDetail(item as any)"
          />
        </div>
      </section>
    </div>
  </BasePage>
</template>

<style scoped lang="scss">
/* ── Bento placement ──────────────────────────────────────────
 * wide:   [cover 3 ×3 rows][week 9] / [stat 3][stat 3][stat 3] / [go 9]
 * medium: [cover 4 ×2 rows][week 8] / [go 8] / [stat 4 ×3]
 * narrow: one column
 */
.articles-bento {
  .tile-cover {
    grid-column: span 3;
    grid-row: span 3;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem 1rem;
  }

  .tile-week {
    grid-column: span 9;
  }

  .tile-stat {
    grid-column: span 3;
  }

  .tile-go {
    grid-column: span 9;
  }

  .tile-shelf {
    grid-column: 1 / -1;
  }
}

@media (max-width: 1023px) {
  .articles-bento {
    .tile-cover {
      grid-column: span 4;
      grid-row: span 2;
    }

    .tile-week,
    .tile-go {
      grid-column: span 8;
    }

    .tile-go {
      order: 1;
    }

    .tile-stat {
      grid-column: span 4;
      order: 2;
    }

    .tile-shelf {
      order: 3;
    }
  }
}

@media (max-width: 639px) {
  .articles-bento {
    .tile-cover,
    .tile-week,
    .tile-go,
    .tile-stat {
      grid-column: 1 / -1;
      grid-row: auto;
    }
  }
}

/* ── This week ── */
.tile-week {
  display: flex;
  align-items: center;

  .tile-head {
    width: 100%;
  }

  .week-days {
    display: flex;
    gap: 0.5rem;
  }

  .day {
    @apply flex items-center justify-center text-sm md:text-base tabular-nums;
    width: 2rem;
    height: 2rem;
    border-radius: 0.6rem;
    color: var(--color-ink-3);
    background: var(--color-tile-sunken);
    transition:
      background-color var(--dur-hover) ease,
      color var(--dur-hover) ease;

    &.is-done {
      color: #fff;
      background: var(--color-brand);
      box-shadow: 0 4px 10px -6px rgba(var(--color-brand-rgb), 0.7);
    }
  }
}

/* ── Stat tiles ── */
.tile-stat {
  --tone: var(--color-brand-text);
  --tone-soft: var(--color-brand-soft);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  &.tone-sky {
    --tone: var(--color-sky-text);
    --tone-soft: var(--color-sky-soft);
  }

  &.tone-deep {
    --tone: var(--color-brand-ink);
    --tone-soft: var(--color-brand-soft-2);
  }

  .stat-icon {
    @apply flex items-center justify-center text-lg;
    width: 2rem;
    height: 2rem;
    margin-bottom: 0.5rem;
    border-radius: 0.6rem;
    color: var(--tone);
    background: var(--tone-soft);
  }

  .num {
    @apply text-2xl break-keep;
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

/* ── Progress + start (brand tile) ── */
.tile-go {
  display: flex;
  align-items: center;
  gap: 1rem;

  .go-progress {
    flex: 1;

    :deep(.progress-bar) {
      background-color: rgba(255, 255, 255, 0.22);
    }

    :deep(.progress-bar-text) {
      color: #fff;
      font-variant-numeric: tabular-nums;
    }
  }

  :deep(.base-button.primary:not(.disabled)) {
    background: #fff;
    color: var(--color-brand);
    box-shadow: 0 8px 18px -10px rgba(15, 23, 42, 0.45);

    &:hover {
      background: var(--color-brand-tint);
    }
  }

  :deep(.base-button.disabled) {
    background: rgba(255, 255, 255, 0.18) !important;
    color: rgba(255, 255, 255, 0.7) !important;
    box-shadow: none;
  }
}

@media (max-width: 639px) {
  .tile-go {
    flex-direction: column;
    align-items: stretch;
  }
}

/* Container-aware placement (the pinned rail eats ~150px of the viewport) */
@container (min-width: 860px) {
  .articles-bento .tile-cover {
    grid-column: span 3;
    grid-row: span 3;
  }

  .articles-bento .tile-week,
  .articles-bento .tile-go {
    grid-column: span 9;
  }

  .articles-bento .tile-stat {
    grid-column: span 3;
  }

  .articles-bento .tile-go,
  .articles-bento .tile-stat,
  .articles-bento .tile-shelf {
    order: 0;
  }
}

@container (max-width: 859px) {
  .articles-bento .tile-cover {
    grid-column: span 4;
    grid-row: span 2;
  }

  .articles-bento .tile-week,
  .articles-bento .tile-go {
    grid-column: span 8;
  }

  .articles-bento .tile-go {
    order: 1;
  }

  .articles-bento .tile-stat {
    grid-column: span 4;
    order: 2;
  }

  .articles-bento .tile-shelf {
    order: 3;
  }
}

@container (max-width: 599px) {
  .articles-bento .tile-cover,
  .articles-bento .tile-week,
  .articles-bento .tile-go,
  .articles-bento .tile-stat {
    grid-column: 1 / -1;
    grid-row: auto;
  }
}

/* ── Shelves ── */
.tile-shelf {
  .shelf {
    @apply flex gap-4 flex-wrap mt-4;
  }
}
</style>
