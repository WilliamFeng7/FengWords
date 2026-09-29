<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DayActivity } from '@/core/utils/activity.ts'

/*
 * 年度活动：像 GitHub 的贡献图，一格是一天，一列是一周（周一在上），最右一列是本周。
 * 学的词越多颜色越深；只学了时间、这组还没练完的日子用最浅一档。点一格查看当天的学习记录。
 */
const props = defineProps<{ activity: Map<string, DayActivity> }>()
const emit = defineEmits<{ (e: 'select-date', key: string): void }>()

const { t, locale } = useI18n()

const WEEKS = 53
const today = dayjs().startOf('day')
const todayKey = today.format('YYYY-MM-DD')
const thisMonday = today.subtract((today.day() + 6) % 7, 'day')
const start = thisMonday.subtract(WEEKS - 1, 'week')

type Cell = { key: string; col: number; row: number; words: number; spend: number; level: number; future: boolean }

const days = computed(() => {
  const list: { key: string; col: number; row: number; future: boolean }[] = []
  for (let col = 0; col < WEEKS; col++) {
    for (let row = 0; row < 7; row++) {
      const d = start.add(col * 7 + row, 'day')
      list.push({ key: d.format('YYYY-MM-DD'), col, row, future: d.isAfter(today) })
    }
  }
  return list
})

// 颜色深浅按这一年里“学词较多的日子”（第 90 百分位）来分档：偶尔一天学得特别多，也不会把其它日子都压成最浅
const scale = computed(() => {
  const values = days.value
    .map(d => props.activity.get(d.key)?.words ?? 0)
    .filter(v => v > 0)
    .sort((a, b) => a - b)
  if (!values.length) return 1
  return values[Math.min(values.length - 1, Math.floor(0.9 * (values.length - 1)))]
})

function levelOf(a?: DayActivity) {
  if (!a || (a.words <= 0 && a.spend <= 0)) return 0
  if (a.words <= 0) return 1
  return Math.min(4, Math.max(1, Math.ceil((4 * a.words) / scale.value)))
}

const cells = computed<Cell[]>(() =>
  days.value.map(d => {
    const a = props.activity.get(d.key)
    return { ...d, words: a?.words ?? 0, spend: a?.spend ?? 0, level: d.future ? 0 : levelOf(a) }
  })
)

const summary = computed(() => {
  const past = cells.value.filter(c => !c.future)
  const active = (c: Cell) => c.words > 0 || c.spend > 0
  let best = 0
  let run = 0
  for (const c of past) {
    run = active(c) ? run + 1 : 0
    best = Math.max(best, run)
  }
  // 当前连续：从今天往回数；今天还没学的话从昨天开始算
  let current = 0
  let i = past.length - 1
  if (i >= 0 && !active(past[i])) i--
  for (; i >= 0 && active(past[i]); i--) current++
  return {
    words: past.reduce((sum, c) => sum + c.words, 0),
    days: past.filter(active).length,
    current,
    best,
  }
})

const chips = computed(() => [
  { key: 'activity_words', n: summary.value.words },
  { key: 'activity_days', n: summary.value.days },
  { key: 'activity_streak', n: summary.value.current },
  { key: 'activity_best_streak', n: summary.value.best },
])

const monthFormat = computed(() => new Intl.DateTimeFormat(locale.value === 'tw' ? 'zh-TW' : locale.value, { month: 'short' }))
const weekdayFormat = computed(
  () => new Intl.DateTimeFormat(locale.value === 'tw' ? 'zh-TW' : locale.value, { weekday: 'short' })
)
const dateFormat = computed(
  () =>
    new Intl.DateTimeFormat(locale.value === 'tw' ? 'zh-TW' : locale.value, {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    })
)

// 月份标在这个月第一次出现的那一列上；最左边那个如果离下一个太近就不标，免得重叠
const months = computed(() => {
  const out: { col: number; label: string }[] = []
  let prev = -1
  for (let col = 0; col < WEEKS; col++) {
    const monday = start.add(col, 'week')
    if (monday.month() !== prev) {
      out.push({ col, label: monthFormat.value.format(monday.toDate()) })
      prev = monday.month()
    }
  }
  if (out.length > 1 && out[1].col - out[0].col < 3) out.shift()
  return out
})

// 周一、周三、周五
const weekdayLabels = computed(() =>
  [0, 2, 4].map(row => ({ row, label: weekdayFormat.value.format(start.add(row, 'day').toDate()) }))
)

// ── 悬停提示：整张图共用一个，靠事件委托定位，不给 371 个格子各挂一个组件 ──
const wrapRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const tip = ref<{ x: number; y: number; title: string; text: string } | null>(null)

function cellFromEvent(e: Event) {
  const el = (e.target as HTMLElement)?.closest?.('[data-key]') as HTMLElement | null
  if (!el) return null
  return { el, cell: cells.value[Number(el.dataset.index)] }
}

function onOver(e: MouseEvent) {
  const hit = cellFromEvent(e)
  if (!hit || hit.cell.future || !wrapRef.value) return (tip.value = null)
  const box = wrapRef.value.getBoundingClientRect()
  const r = hit.el.getBoundingClientRect()
  const c = hit.cell
  tip.value = {
    x: r.left - box.left + r.width / 2,
    y: r.top - box.top,
    title: dateFormat.value.format(dayjs(c.key).toDate()),
    text:
      c.words > 0
        ? t('activity_tip_words', { n: c.words })
        : c.spend > 0
          ? t('activity_tip_time', { n: Math.max(1, Math.round(c.spend / 60000)) })
          : t('activity_tip_none'),
  }
}

function onClick(e: MouseEvent) {
  const hit = cellFromEvent(e)
  if (hit && !hit.cell.future) emit('select-date', hit.cell.key)
}

// 数据格子“逐列亮起”只在本次打开网站后第一次看到时播放，之后再回到首页直接显示（hasRevealed 在模块作用域）
const revealing = ref(!hasRevealed)

onMounted(async () => {
  await nextTick()
  // 窄屏放不下一整年时横向滚动，默认停在最近几周
  if (scrollRef.value) scrollRef.value.scrollLeft = scrollRef.value.scrollWidth
  hasRevealed = true
})
</script>

<script lang="ts">
// 模块级：记录本次会话里热力图是否已经播放过入场
let hasRevealed = false
</script>

<template>
  <div class="heat" ref="wrapRef">
    <div class="heat-head">
      <div class="title">{{ $t('activity_title') }}</div>
      <div class="heat-summary">
        <i18n-t v-for="c in chips" :key="c.key" :keypath="c.key" tag="span" class="chip">
          <template #n>
            <b>{{ c.n }}</b>
          </template>
        </i18n-t>
      </div>
    </div>

    <div class="heat-scroll" :class="{ 'is-revealing': revealing }" ref="scrollRef">
      <div
        class="heat-grid"
        :style="{ '--weeks': WEEKS }"
        role="img"
        :aria-label="`${$t('activity_title')}: ${$t('activity_words', { n: summary.words })}`"
        @mouseover="onOver"
        @mouseleave="tip = null"
        @click="onClick"
      >
        <span
          v-for="m in months"
          :key="'m' + m.col"
          class="month"
          :style="{ gridColumn: `${m.col + 2} / span 4` }"
          aria-hidden="true"
          >{{ m.label }}</span
        >
        <span
          v-for="w in weekdayLabels"
          :key="'w' + w.row"
          class="weekday"
          :style="{ gridRow: w.row + 2 }"
          aria-hidden="true"
          >{{ w.label }}</span
        >
        <i
          v-for="(c, index) in cells"
          :key="c.key"
          class="cell"
          :class="[`lv${c.level}`, { 'is-future': c.future, 'is-today': c.key === todayKey }]"
          :data-key="c.key"
          :data-index="index"
          :style="{ gridColumn: c.col + 2, gridRow: c.row + 2 }"
          aria-hidden="true"
        ></i>
      </div>
    </div>

    <div class="heat-foot" aria-hidden="true">
      <span>{{ $t('activity_less') }}</span>
      <i class="cell lv0"></i>
      <i class="cell lv1"></i>
      <i class="cell lv2"></i>
      <i class="cell lv3"></i>
      <i class="cell lv4"></i>
      <span>{{ $t('activity_more') }}</span>
    </div>

    <Transition name="heat-tip">
      <div v-if="tip" class="heat-tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">
        <div class="heat-tip-title">{{ tip.title }}</div>
        <div>{{ tip.text }}</div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.heat {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.heat-head {
  @apply flex items-center justify-between gap-3 flex-wrap;
}

.heat-summary {
  @apply flex items-center gap-2 flex-wrap;
}

.chip {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  font-size: 0.8rem;
  color: var(--color-ink-2);
  background: var(--color-tile-sunken);
  border: 1px solid var(--color-stroke);

  b {
    font-family: var(--font-display);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    color: var(--color-ink-1);
  }
}

/* 放不下一整年时横向滚动（手机），默认停在最近几周 */
.heat-scroll {
  position: relative;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.25rem 0.1rem 0.35rem;
  scrollbar-width: thin;
}

.heat-grid {
  display: grid;
  grid-template-columns: auto repeat(var(--weeks), minmax(10px, 1fr));
  grid-template-rows: auto repeat(7, auto);
  gap: 3px;
  min-width: 41rem;
  cursor: pointer;
}

.month {
  grid-row: 1;
  padding-bottom: 0.3rem;
  font-size: 0.72rem;
  line-height: 1;
  color: var(--color-ink-3);
  white-space: nowrap;
}

.weekday {
  grid-column: 1;
  align-self: center;
  padding-right: 0.5rem;
  font-size: 0.72rem;
  line-height: 1;
  color: var(--color-ink-3);
  white-space: nowrap;
}

.cell {
  display: block;
  aspect-ratio: 1;
  border-radius: 3px;
  background: var(--color-tile-sunken);
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.05);
  transition:
    transform 140ms var(--ease-out),
    box-shadow 140ms var(--ease-out);

  &.lv1 {
    background: rgba(var(--color-brand-rgb), 0.22);
  }

  &.lv2 {
    background: rgba(var(--color-brand-rgb), 0.45);
  }

  &.lv3 {
    background: rgba(var(--color-brand-rgb), 0.72);
  }

  &.lv4 {
    background: var(--color-brand);
  }

  &.is-today {
    box-shadow: inset 0 0 0 1.5px rgba(var(--color-brand-rgb), 0.6);
  }

  &.is-future {
    visibility: hidden;
  }
}

html.dark .cell:not(.lv1, .lv2, .lv3, .lv4) {
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

/*
 * 本次打开网站后第一次看到时：一整年从左到右“扫”出来。
 * 用一块与卡片同色的遮罩向右收起（只动 transform，一个合成层），
 * 而不是给几百个格子各开一个动画（几百个图层，首页会卡）。
 */
.heat-scroll.is-revealing::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  background: var(--color-tile);
  transform-origin: right center;
  pointer-events: none;
  animation: heat-wipe 520ms var(--ease-out) 140ms both;
}

@keyframes heat-wipe {
  from {
    transform: scaleX(1);
  }

  to {
    transform: scaleX(0);
  }
}

@media (hover: hover) and (pointer: fine) {
  .heat-grid .cell:not(.is-future):hover {
    position: relative;
    z-index: 1;
    transform: scale(1.3);
    box-shadow:
      0 0 0 2px var(--color-tile),
      0 4px 10px -2px rgba(15, 23, 42, 0.3);
  }
}

.heat-foot {
  @apply flex items-center justify-end gap-1;
  font-size: 0.72rem;
  color: var(--color-ink-3);

  .cell {
    width: 0.7rem;
  }

  span {
    margin: 0 0.25rem;
  }
}

.heat-tip {
  position: absolute;
  z-index: 5;
  pointer-events: none;
  transform: translate3d(-50%, calc(-100% - 8px), 0);
  padding: 0.35rem 0.6rem;
  font-size: 0.78rem;
  line-height: 1.45;
  white-space: nowrap;
  color: var(--color-main-text);
  background: var(--color-tooltip-bg);
  border: 1px solid var(--color-stroke);
  border-radius: 0.625rem;
  box-shadow: var(--shadow-pop);
}

.heat-tip-title {
  font-weight: 600;
  color: var(--color-ink-1);
}

.heat-tip-enter-active,
.heat-tip-leave-active {
  transition: opacity 120ms var(--ease-out);
}

.heat-tip-enter-from,
.heat-tip-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .heat-scroll.is-revealing::after {
    display: none;
  }

  .heat-grid .cell:hover {
    transform: none !important;
  }
}
</style>
