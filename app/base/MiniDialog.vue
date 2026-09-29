<script setup lang="ts">
import { nextTick, watch } from 'vue'

interface IProps {
  modelValue?: boolean
  width?: string
}

let props = withDefaults(defineProps<IProps>(), {
  modelValue: true,
  width: '180rem',
})
let modalRef = $ref(null)
let style = $ref({ top: '2.4rem', bottom: 'unset' })

watch(
  () => props.modelValue,
  n => {
    if (n)
      nextTick(() => {
        if (modalRef) {
          const modal = modalRef as HTMLElement
          if (modal.getBoundingClientRect().bottom > window.innerHeight) {
            style = { top: 'unset', bottom: '2.5rem' }
          }
        }
      })
  }
)
</script>

<template>
  <Transition name="mini-pop">
    <div
      v-if="modelValue"
      ref="modalRef"
      class="mini-modal"
      :class="style.bottom !== 'unset' && 'from-bottom'"
      :style="{ width, ...style }"
    >
      <slot></slot>
    </div>
  </Transition>
</template>

<style lang="scss">
.mini-row-title {
  @apply text-center text-base font-bold mb-2;
  color: var(--color-font-1);
}

.mini-row {
  @apply min-h-10 flex justify-between items-center gap-space text-base text-font-1 word-break-keep-all;
  color: var(--color-font-1);
}

.mini-modal {
  background: var(--color-card-bg);
  padding: var(--space) 1rem;
  border: 1px solid var(--color-stroke);
  border-radius: 0.875rem;
  box-shadow: var(--shadow-pop);
  /* the box is centred with translateX(-50%); in local space its visual top-centre sits at x = 0 */
  transform-origin: 0 0;
  @apply z-9 absolute left-1/2 transform -translate-x-1/2 w-50;

  &.from-bottom {
    transform-origin: 0 100%;
  }
}

/* position uses translate(-50%); motion rides the standalone opacity/scale properties */
.mini-pop-enter-active {
  transition:
    opacity var(--dur-pop) var(--ease-out),
    scale var(--dur-pop) var(--ease-out);
}

.mini-pop-leave-active {
  transition:
    opacity 120ms var(--ease-out),
    scale 120ms var(--ease-out);
}

.mini-pop-enter-from,
.mini-pop-leave-to {
  opacity: 0;
  scale: 0.96;
}

@media (prefers-reduced-motion: reduce) {
  .mini-pop-enter-from,
  .mini-pop-leave-to {
    scale: none;
  }
}
</style>
