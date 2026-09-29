<script setup lang="ts">
import { inject, computed, watch } from 'vue';

const props = defineProps<{
  label: string;
  value: any;
  disabled?: boolean;
}>();

// 通过inject获取ElSelect提供的数据和方法
const selectValue = inject('selectValue', null);
const selectHandler = inject('selectHandler', null);

// 计算当前选项是否被选中
const isSelected = computed(() => {
  return selectValue.value === props.value;
});

// 点击选项时调用ElSelect提供的方法
const handleClick = () => {
  if (props.disabled) return;
  if (selectHandler) {
    selectHandler(props.value, props.label);
  }
};

// 监听props变化，确保在props更新时重新计算isSelected
watch(() => props.value, () => {}, { immediate: true });
</script>

<template>
  <li
    class="option"
    :class="{
      'is-selected': isSelected,
      'is-disabled': disabled
    }"
    @click="handleClick"
  >
    <slot>
      <span class="option__label">{{ label }}</span>
    </slot>
  </li>
</template>

<style scoped lang="scss">
.option {
  @apply flex items-center px-2 py-1 cursor-pointer;
  border-radius: 0.5rem;
  transition: background-color var(--dur-hover) ease, color var(--dur-hover) ease;

  &:hover {
    background-color: var(--color-fourth);
  }

  &:active:not(.is-disabled) {
    background-color: var(--color-brand-soft-2);
    transition-duration: var(--dur-press);
  }

  &.is-selected {
    color: var(--color-select-bg);
    font-weight: bold;
    background-color: var(--color-fifth);
  }

  &.is-disabled {
    color: #c0c4cc;
    cursor: not-allowed;
  }

  &__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
