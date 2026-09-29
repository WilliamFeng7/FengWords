<script setup lang="ts">
import { useBaseStore } from '@/core/stores/base.ts'
import { BaseButton, CountUp, Progress } from '@/base'
import type { PracticeData } from '@/core/composables/practice-words/practice-word-session.ts'
import { ShortcutKey } from '@/core/types/enum.ts'
import { emitter, useEvents } from '@/core/utils/eventBus.ts'
import { useSettingStore } from '@/core/stores/setting.ts'
import { usePracticeStore } from '@/core/stores/practice.ts'
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import { defineAsyncComponent, inject, watch } from 'vue'
import isoWeek from 'dayjs/plugin/isoWeek'
import { msToHourMinute } from '@/core/utils'
import ShareIcon from '@/components/channel-icons/ShareIcon.vue'
import { useI18n } from 'vue-i18n'

dayjs.extend(isoWeek)
dayjs.extend(isBetween)
const { t: $t } = useI18n()
const Dialog = defineAsyncComponent(() => import('@/base/dialog/Dialog.vue'))

const props = defineProps({
  loading: Boolean,
})
const store = useBaseStore()
const settingStore = useSettingStore()
const statStore = usePracticeStore()
const model = defineModel({ default: false })
let list = $ref<boolean[]>([])
const practiceData = inject<PracticeData>('practiceData')!

function calcWeekList() {
  // 获取本周的起止时间
  const startOfWeek = dayjs().startOf('isoWeek') // 周一
  const endOfWeek = dayjs().endOf('isoWeek') // 周日
  // 初始化 7 天的数组，默认 false
  const weekList = Array(7).fill(false)

  store.sdict.statistics.forEach(item => {
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
      weekList[idx] = true
    }
  })
  list = weekList
}

// 监听 model 弹窗打开时重新计算
watch([model, () => props.loading], ([open, loading]) => {
  if (open && !loading) {
    console.log('计算本周学习记录')
    calcWeekList() // 计算本周学习记录
  }
})

const close = () => (model.value = false)

useEvents([
  //特意注释掉，因为在练习界面用快捷键下一组时，需要判断是否在结算界面
  // [ShortcutKey.NextChapter, close],
  [ShortcutKey.RepeatChapter, close],
])

function options(emitType: string) {
  emitter.emit(emitType)
  // “再来一组”由练习页成功初始化下一组后关闭；生成空任务时保留结算弹窗。
  if (emitType !== ShortcutKey.NextChapter) close()
}

// 计算学习进度百分比
const studyProgress = $computed(() => {
  if (!store.sdict.length) return 0
  return Math.round((store.sdict.lastLearnIndex / store.sdict.length) * 100)
})

// 计算正确率
const accuracyRate = $computed(() => {
  if (statStore.total === 0) return 100
  return Math.round(((statStore.total - statStore.wrong) / statStore.total) * 100)
})

// 获取鼓励文案
const encouragementText = $computed(() => {
  const rate = accuracyRate
  if (rate >= 95) return '🎉 ' + $t('encouragement_95')
  if (rate >= 85) return '👍 ' + $t('encouragement_85')
  if (rate >= 70) return '💪 ' + $t('encouragement_70')
  return '🌟 ' + $t('encouragement_default')
})
</script>

<template>
  <Dialog v-model="model" :close-on-click-bg="false" :header="false" :keyboard="false" :show-close="false">
    <div class="p-8 pr-3 bg-[var(--bg-card-primary)] min-w-130 rounded-2xl">
      <!-- Header Section -->
      <div class="text-center relative">
        <div class="text-3xl font-bold mb-2 text-[var(--color-brand-text)]">
          <div>🎉 {{ $t('daily_task_complete') }}</div>
        </div>
        <p class="font-medium text-lg">{{ encouragementText }}</p>
      </div>

      <div class="relative">
        <div class="space-y-4" :class="!loading && 'is-ready'" v-opacity="!loading">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="item" style="--i: 0">
              <IconFluentClock20Regular class="item-icon" />
              <div class="text-sm mb-1 font-medium">{{ $t('study_duration') }}</div>
              <div class="text-xl font-bold">{{ msToHourMinute(statStore.spend, true) }}</div>
            </div>

            <div class="item" style="--i: 1">
              <IconFluentTarget20Regular class="item-icon" />
              <div class="text-sm mb-1 font-medium">{{ $t('accuracy_rate') }}</div>
              <div class="text-xl font-bold"><CountUp :value="accuracyRate" :run="!loading" :delay="190" />%</div>
            </div>

            <div class="item" style="--i: 2">
              <IconFluentSparkle20Regular class="item-icon" />
              <div class="text-sm mb-1 font-medium">{{ $t('new_words') }}</div>
              <div class="text-xl font-bold"><CountUp :value="statStore.newWordNumber" :run="!loading" :delay="260" /></div>
            </div>

            <div class="item" style="--i: 3">
              <IconFluentBook20Regular class="item-icon" />
              <div class="text-sm mb-1 font-medium">{{ $t('review') }}</div>
              <div class="text-xl font-bold">
                <CountUp :value="statStore.reviewWordNumber" :run="!loading" :delay="330" />
              </div>
            </div>
          </div>

          <div>
            <div class="font-medium text-lg text-center mb-2">错词统计</div>
            <div class="flex gap-space flex-wrap max-w-150">
              <span
                class="bg-[var(--bg-card-secend)] py-1 px-2 rounded-md"
                v-for="item in Object.entries(practiceData.wrongTimesMap)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)"
              >
                {{ item[0] }}
                {{ item[1] }}次
              </span>
            </div>
          </div>

          <div class="summary-main w-full gap-3 flex">
            <div class="space-y-6 flex-1">
              <!-- Weekly Progress -->
              <div class="bg-[--bg-card-secend] rounded-xl p-2">
                <div class="text-center mb-4">
                  <div class="text-xl font-semibold mb-1">{{ $t('weekly_record') }}</div>
                </div>
                <div class="flex justify-between gap-4">
                  <div
                    v-for="(item, i) in list"
                    :key="i"
                    class="flex-1 text-center px-2 py-3 rounded-lg"
                    :class="item ? 'week-day is-done' : 'week-day'"
                  >
                    <div class="font-semibold mb-1">{{ i + 1 }}</div>
                    <div
                      class="w-2 h-2 rounded-full mx-auto mb-1"
                      :class="item ? 'bg-white bg-opacity-30' : 'bg-gray-300'"
                    ></div>
                  </div>
                </div>
              </div>

              <!-- Progress Overview -->
              <div class="bg-[var(--bg-card-secend)] rounded-xl py-2 px-6">
                <div class="flex justify-between items-center mb-3">
                  <div class="text-xl font-semibold">{{ $t('study_progress') }}</div>
                  <div class="text-2xl font-bold text-[var(--color-brand-text)] tabular-nums">
                    <CountUp :value="studyProgress" :run="!loading" :duration="600" :delay="120" />%
                  </div>
                </div>
                <Progress :percentage="studyProgress" size="large" :show-text="false" />
                <div class="flex justify-between text-sm font-medium mt-4">
                  <span>{{ $t('learned') }}: {{ store.sdict.lastLearnIndex }}</span>
                  <span>{{ $t('total_words') }}: {{ store.sdict.length }}</span>
                </div>
              </div>
            </div>
            <ShareIcon />
          </div>
          <!-- Action Buttons -->
          <div class="summary-actions flex justify-center flex-wrap">
            <BaseButton
              :keyboard="settingStore.shortcutKeyMap[ShortcutKey.RepeatChapter]"
              @click="options(ShortcutKey.RepeatChapter)"
            >
              <div class="center gap-2">
                <IconFluentArrowClockwise20Regular class="i-rotate" />
                {{ $t('relearn') }}
              </div>
            </BaseButton>
            <BaseButton
              :keyboard="settingStore.shortcutKeyMap[ShortcutKey.NextChapter]"
              @click="options(ShortcutKey.NextChapter)"
            >
              <div class="center gap-2">
                <IconFluentPlay20Regular />
                {{ studyProgress === 100 ? $t('start_from_beginning') : $t('another_group') }}
              </div>
            </BaseButton>
            <BaseButton @click="$router.back">
              <div class="center gap-2">
                <IconFluentHome20Regular />
                {{ $t('back_to_home') }}
              </div>
            </BaseButton>
          </div>
        </div>
        <div class="h-full w-full center flex-col absolute top-0 left-0 space-y-2" v-if="loading">
          <IconEosIconsLoading class="text-3xl" />
          <div>结算中...</div>
          <div>请耐心等待，刷新页面可能导致数据丢失</div>
        </div>
      </div>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
@media (max-width: 768px) {
  .summary-main {
    flex-direction: column;
  }

  .summary-actions {
    flex-direction: column;
    .base-button {
      width: 100%;
      min-height: 48px;
    }
  }

  :deep(.dialog-body) {
    max-width: 95vw;
  }
}
</style>

<style scoped>
.item {
  @apply bg-[var(--bg-card-secend)] rounded-xl p-2 text-center;
  border: 1px solid var(--color-stroke);
}

.item-icon {
  color: var(--color-brand-text);
}

.week-day {
  background: var(--color-tile);
  color: var(--color-ink-2);
  transition: background-color var(--dur-hover) ease;
}

.week-day.is-done {
  background: var(--color-success);
  color: #fff;
  box-shadow: 0 8px 18px -10px rgba(22, 163, 74, 0.8);
}

/* a finished session is the one moment that earns a flourish: results pop in once settling is done */
.is-ready .item {
  animation: stat-pop 460ms var(--ease-out) backwards;
  animation-delay: calc(120ms + var(--i) * 70ms);
}

@keyframes stat-pop {
  from {
    opacity: 0;
    transform: translate3d(0, 10px, 0) scale(0.94);
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-ready .item {
    animation-name: fade-in;
  }
}
</style>
