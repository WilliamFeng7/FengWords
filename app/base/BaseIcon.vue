<script setup lang="ts">
import Tooltip from './Tooltip.vue'
import { IconSwap, replayIcon } from './icon/motion.ts'

const props = withDefaults(
  defineProps<{
    title?: string
    disabled?: boolean
    active?: boolean
    noBg?: boolean
    /** 图标切换时是否播放过渡（逐帧换图的图标，如音量波纹，应关闭） */
    swap?: boolean
  }>(),
  { swap: true }
)

const emit = defineEmits(['click'])

function onClick(e: MouseEvent) {
  if (props.disabled) return
  emit('click', e)
  replayIcon(e.currentTarget as Element)
}
</script>

<template>
  <Tooltip :title="title">
    <div v-bind="$attrs" @click="onClick" class="icon-wrapper" :class="{ disabled, noBg, active }">
      <IconSwap :enabled="swap">
        <slot />
      </IconSwap>
    </div>
  </Tooltip>
</template>

<style scoped lang="scss">
$w: 1.4rem;
.icon-wrapper {
  position: relative;
  cursor: pointer;
  //padding: 2rem;
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.6rem;
  background: transparent;
  transition:
    background-color var(--dur-hover) ease,
    color var(--dur-hover) ease,
    opacity var(--dur-hover) ease,
    transform 160ms var(--ease-out);

  &:active:not(.disabled) {
    transform: scale(0.92);
    transition-duration: var(--dur-hover), var(--dur-hover), var(--dur-hover), var(--dur-press);
  }

  &.disabled {
    cursor: not-allowed;
    opacity: 0.3;
  }

  &.active {
    background: var(--color-fourth);
  }

  :deep(svg) {
    display: block;
    flex-shrink: 0;
    width: $w;
    height: $w;
  }
}

@media (hover: hover) and (pointer: fine) {
  .icon-wrapper:hover:not(.disabled, .noBg) {
    background: var(--color-fourth);
  }
}

@media (prefers-reduced-motion: reduce) {
  .icon-wrapper:active {
    transform: none !important;
  }
}
</style>
