<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

/**
 * 数字从 0 滚到目标值（先快后慢），只用在练习结算这种少见、值得庆祝的时刻 ——
 * 常看的页面上的数据不做滚动，免得每次都要等它停下来才能读。
 * run 为 false 时停在 0，变成 true 后等 delay 再开始；减少动态效果时直接显示结果。
 */
const props = withDefaults(
  defineProps<{
    value: number
    run?: boolean
    duration?: number
    delay?: number
  }>(),
  { run: true, duration: 700, delay: 0 }
)

const target = () => Math.round(Number(props.value) || 0)
const shown = ref(import.meta.client ? 0 : target())
let raf = 0
let timer = 0

function stop() {
  cancelAnimationFrame(raf)
  window.clearTimeout(timer)
}

function play() {
  if (!import.meta.client) return
  stop()
  const to = target()
  if (!props.run) {
    shown.value = 0
    return
  }
  if (to === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    shown.value = to
    return
  }
  timer = window.setTimeout(() => {
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / props.duration)
      // ease-out（三次方）：一开始跳得快，接近终点时慢慢停住
      shown.value = Math.round(to * (1 - Math.pow(1 - t, 3)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  }, props.delay)
}

watch(() => [props.value, props.run], play, { immediate: true })
onBeforeUnmount(() => import.meta.client && stop())
</script>

<template>
  <span class="tabular-nums">{{ shown }}</span>
</template>
