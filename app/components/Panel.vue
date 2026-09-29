<script setup lang="ts">
import { computed, provide } from 'vue'
import { useSettingStore } from '@/core/stores/setting'
import { Tooltip, Close } from '@/base'
import { ShortcutKey } from '@/core/types'

const settingStore = useSettingStore()
let tabIndex = $ref(0)
provide(
  'tabIndex',
  computed(() => tabIndex)
)
</script>
<template>
  <!-- appear：打开练习页时面板也按展开时的方式滑入，而不是直接出现 -->
  <Transition name="panel-slide" appear>
    <div class="panel anim" v-bind="$attrs" v-show="settingStore.showPanel">
      <header class="flex justify-between items-center py-3 px-space">
        <div class="color-main">
          <slot name="title"></slot>
        </div>
        <Close
          :tooltip="`${$t('close')}(${settingStore.shortcutKeyMap[ShortcutKey.TogglePanel]})`"
          @click="settingStore.showPanel = false"
        />
      </header>
      <div class="flex-1 overflow-auto">
        <slot></slot>
      </div>
    </div>
  </Transition>
</template>
<style scoped lang="scss">
.panel {
  width: var(--panel-width);
  background: var(--color-second);
  border: 1px solid var(--color-stroke);
  border-radius: var(--radius-tile);
  box-shadow: var(--shadow-pop);
  @apply flex flex-col h-full;
}

/* slides in from its own edge; opacity + transform only, exit a touch faster */
.panel-slide-enter-active {
  transition:
    opacity 240ms var(--ease-out),
    transform 240ms var(--ease-out);
}

.panel-slide-leave-active {
  transition:
    opacity 180ms var(--ease-out),
    transform 180ms var(--ease-out);
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
  transform: translate3d(16px, 0, 0);
}

/* phones: the panel is a centred sheet, so it rises instead of sliding from the edge */
@media (max-width: 768px) {
  .panel-slide-enter-from,
  .panel-slide-leave-to {
    transform: translate3d(0, 12px, 0) scale(0.98);
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel-slide-enter-from,
  .panel-slide-leave-to {
    transform: none;
  }
}

@media (max-width: 768px) {
  .panel {
    width: 90vw;
    max-width: 400px;
    max-height: 90vh;
    height: auto;
    border-radius: 0.4rem;
  }

  .panel > div.flex-1 {
    max-height: calc(90vh - 3.2rem);
  }

  .panel header {
    padding: 0.5rem 0.5rem;

    .color-main {
      font-size: 0.9rem;
    }
  }
}

// 超小屏幕适配
@media (max-width: 480px) {
  .panel {
    width: 95vw;
    max-height: 94vh;
  }

  .panel > div.flex-1 {
    max-height: calc(94vh - 3rem);
  }

  .panel header {
    padding: 0.3rem 0.3rem;

    .color-main {
      font-size: 0.8rem;
    }
  }
}
</style>
