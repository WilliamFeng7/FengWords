<template>
  <Transition :name="anim ? 'message-fade' : ''" appear>
    <div
      v-if="visible"
      class="message"
      :class="{ [type]: true, shadow }"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
    >
      <div class="message-content">
        <IconLineMdConfirmCircle v-if="props.type === 'success'" class="message-icon" />
        <IconLineMdAlertCircle v-if="props.type === 'warning'" class="message-icon" />
        <IconLineMdAlertCircle v-if="props.type === 'info'" class="message-icon" />
        <IconLineMdCloseCircle v-if="props.type === 'error'" class="message-icon" />
        <span class="message-text">{{ message }}</span>

        <button v-if="action" class="message-action" @click="handleAction">{{ action.text }}</button>

        <Close v-if="showClose" class="message-close" @click="close" />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Close } from '../icon'

interface ToastAction {
  text: string
  onClick?: () => void
}

interface Props {
  message: string
  type?: 'success' | 'warning' | 'info' | 'error'
  duration?: number
  showClose?: boolean
  shadow?: boolean
  anim?: boolean
  action?: ToastAction
}

const props = withDefaults(defineProps<Props>(), {
  type: 'info',
  duration: 3000,
  showClose: false,
  shadow: true,
  anim: true,
})

const emit = defineEmits(['close'])
const visible = ref(false)
let timer = null

const startTimer = () => {
  if (props.duration > 0) {
    timer = setTimeout(close, props.duration)
  }
}

const clearTimer = () => {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

const handleMouseEnter = () => {
  clearTimer()
}

const handleMouseLeave = () => {
  startTimer()
}

const handleAction = () => {
  props.action?.onClick?.()
}

const close = () => {
  visible.value = false
  // 延迟发出close事件，等待离场动画完成（与 .message-fade-leave-active 保持一致）
  setTimeout(() => {
    emit('close')
  }, 200)
}

onMounted(() => {
  visible.value = true
  startTimer()
})

onBeforeUnmount(() => {
  clearTimer()
})

// 暴露方法给父组件
defineExpose({
  close,
  show: () => {
    visible.value = true
    startTimer()
  },
})
</script>

<style scoped lang="scss">
.message {
  --tone: var(--color-brand-text);
  --tone-soft: var(--color-tile);
  pointer-events: auto;
  @apply py-2.5 px-4 relative min-w-50 text-[0.95rem];
  border-radius: 0.875rem;
  border: 1px solid var(--color-stroke);
  border: 1px solid color-mix(in srgb, var(--tone) 28%, var(--color-stroke));
  background: var(--color-tile);
  background: color-mix(in srgb, var(--tone-soft) 70%, var(--color-tile));
  color: var(--color-ink-1);

  &.shadow {
    box-shadow: var(--shadow-pop);
  }

  &.success {
    --tone: var(--color-success);
    --tone-soft: var(--color-success-soft);
  }

  &.warning {
    --tone: var(--color-amber);
    --tone-soft: var(--color-amber-soft);
  }

  &.info {
    --tone: var(--color-ink-3);
    --tone-soft: var(--color-tile-sunken);
  }

  &.error {
    --tone: var(--color-danger);
    --tone-soft: var(--color-danger-soft);
  }
}

.message-icon {
  flex-shrink: 0;
  font-size: 1.15rem;
  color: var(--tone);
}

.message-content {
  @apply flex items-center gap-2;
}

.message-text {
  @apply flex-1 lh-none;
}

.message-action {
  @apply ml-2 shrink-0 cp text-sm font-medium px-2 py-0.5 rounded;
  color: var(--color-brand-text);
  border: 1px solid currentColor;
  background: transparent;
  line-height: 1.4;
  transition: opacity var(--dur-hover) ease;
}

.message-close {
  @apply w-10 flex justify-end cp opacity-70 hover:opacity-100;
  transition: opacity var(--dur-hover) ease;
}

/* in from the top, out through the top — interruptible transitions, never keyframes */
.message-fade-enter-active {
  transition:
    opacity 260ms var(--ease-out),
    transform 260ms var(--ease-out);
}

.message-fade-leave-active {
  transition:
    opacity 200ms var(--ease-out),
    transform 200ms var(--ease-out);
}

.message-fade-enter-from {
  opacity: 0;
  transform: translate3d(0, -14px, 0) scale(0.98);
}

.message-fade-leave-to {
  opacity: 0;
  transform: translate3d(0, -10px, 0) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .message-fade-enter-from,
  .message-fade-leave-to {
    transform: none;
  }
}
</style>
