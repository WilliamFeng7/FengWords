<script setup lang="ts"></script>

<template>
  <div class="flex box-border cp">
    <div class="option-wrap">
      <slot></slot>
    </div>
    <div class="relative group">
      <div class="more w-10 rounded-r-lg h-full center box-border">
        <IconLucideChevronDown class="more-icon" />
      </div>
      <!-- pt-2 是鼠标从按钮移到菜单时的透明“桥” -->
      <div class="options-bridge absolute z-2 right-0 top-full pt-2 pointer-events-none group-hover:pointer-events-auto">
        <div class="options-pop btn-no-margin">
          <slot name="options"></slot>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.option-wrap {
  width: 100%;
  display: flex;
  :deep(.base-button) {
    width: 100%;
    border-top-right-radius: 0 !important;
    border-bottom-right-radius: 0 !important;
  }
}

.more {
  transition: background-color var(--dur-hover) ease;
}

.more-icon {
  transition: transform 200ms var(--ease-out);
}

.group:hover .more-icon {
  transform: rotate(180deg);
}

/* menu grows out of the chevron's corner.
   多一层选择器：菜单项永远用浅色浮层的配色，压过按钮在品牌色卡片等场景里的着色 */
.options-bridge .options-pop {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 11rem;
  padding: 0.375rem;
  background: var(--color-tile);
  border: 1px solid var(--color-stroke);
  border-radius: 0.875rem;
  box-shadow: var(--shadow-pop);
  transform-origin: top right;
  opacity: 0;
  transform: translate3d(0, -4px, 0) scale(0.97);
  transition:
    opacity 140ms var(--ease-out),
    transform 140ms var(--ease-out);

  :deep(.base-button) {
    width: 100%;
    height: 2.25rem;
    justify-content: flex-start;
    background: transparent;
    border-color: transparent;
    box-shadow: none;
    color: var(--color-main-text);
    border-radius: 0.6rem;
  }

  :deep(.base-button:hover:not(.disabled)) {
    background: var(--color-tile-sunken);
    color: var(--color-ink-1);
  }

  :deep(.base-button.disabled) {
    background: transparent;
    color: var(--color-ink-3);
    opacity: 0.55;
  }
}

.group:hover .options-bridge .options-pop {
  opacity: 1;
  transform: none;
  transition-duration: var(--dur-pop);
}

.primary-btn {
  .more {
    background: var(--btn-primary);
    color: #fff;
    border-left: 1px solid rgba(255, 255, 255, 0.22);
    &:hover {
      background: var(--btn-primary-hover);
    }
  }
}

.orange-btn {
  .more {
    background: var(--btn-orange);
    color: var(--color-brand);
    border-left: 1px solid rgba(var(--color-brand-rgb), 0.14);
    &:hover {
      background: var(--btn-orange-hover);
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .options-bridge .options-pop,
  .group:hover .options-bridge .options-pop {
    transform: none;
  }
}
</style>
