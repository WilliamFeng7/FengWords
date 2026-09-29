<script setup lang="ts">
import { ref, watch } from 'vue'

/**
 * 数值变化时“滚动”换上新值：变大从下方滚入、变小从上方滚入，旧值同时朝反方向离开。
 * 新旧两个值叠在同一个格子里过渡，不会挤动旁边的文字；首次渲染不播放。
 * 用于不常变化、但变化时值得被注意到的数字（每日目标、今日任务数、统计）。
 */
const props = defineProps<{ value: string | number | null | undefined }>()

const up = ref(true)
watch(
  () => props.value,
  (n, o) => {
    const a = Number(n)
    const b = Number(o)
    up.value = Number.isFinite(a) && Number.isFinite(b) ? a >= b : true
  }
)
</script>

<template>
  <span class="roll" :class="up ? 'is-up' : 'is-down'">
    <Transition name="roll">
      <span :key="String(value ?? '')" class="roll-value">{{ value }}</span>
    </Transition>
  </span>
</template>

<style scoped lang="scss">
.roll {
  display: inline-grid;
  vertical-align: bottom;
  font-variant-numeric: tabular-nums;
}

.roll-value {
  grid-area: 1 / 1;
}

.roll-enter-active,
.roll-leave-active {
  transition:
    transform 240ms var(--ease-out),
    opacity 240ms var(--ease-out);
}

.roll-leave-active {
  transition-duration: 160ms;
}

.is-up {
  .roll-enter-from {
    transform: translate3d(0, 60%, 0);
    opacity: 0;
  }

  .roll-leave-to {
    transform: translate3d(0, -60%, 0);
    opacity: 0;
  }
}

.is-down {
  .roll-enter-from {
    transform: translate3d(0, -60%, 0);
    opacity: 0;
  }

  .roll-leave-to {
    transform: translate3d(0, 60%, 0);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .roll-enter-from,
  .roll-leave-to {
    transform: none !important;
  }
}
</style>
